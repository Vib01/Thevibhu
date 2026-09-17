import OpenAI from "openai";
import { PAPER_CONTEXT } from "./systemPrompt";
import { retrieveRelevantChunks } from "../../lib/paperRag";

// Azure AI Foundry model deployment (gpt-4.1-mini), called through the
// OpenAI-compatible /openai/v1 endpoint with a plain API key. See
// https://learn.microsoft.com/azure/foundry/foundry-models/concepts/endpoints
//
// Built lazily inside the request handler, not at module scope -- an eager
// `new OpenAI({...})` at import time throws when the key is unset, which
// breaks `next build`'s static route collection even though this route only
// needs the key at request time.
function getClient() {
  return new OpenAI({
    baseURL: process.env.AZURE_OPENAI_ENDPOINT, // e.g. https://<resource>.openai.azure.com/openai/v1
    apiKey: process.env.AZURE_OPENAI_API_KEY,
  });
}
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4.1-mini";
const EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChartPointContext {
  age: number;
  probability: number;
  lower: number;
  upper: number;
  ciReliable: boolean;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  cohort: number;
  points: ChartPointContext[];
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, cohort, points } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage.role !== "user") {
    return Response.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_API_KEY) {
    return Response.json(
      { error: "Server is missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY configuration." },
      { status: 500 }
    );
  }

  // Retrieve relevant excerpts from the paper's own walkthrough (NN_TMB.html,
  // arXiv:2608.31133) so conceptual/"explain this" questions are grounded in
  // the paper's actual explanations, not a generic gloss. This is additive to
  // -- not a replacement for -- the numeric chart grounding below.
  let paperExcerpts: { heading: string; text: string }[] = [];
  try {
    const embeddingRes = await getClient().embeddings.create({
      model: EMBEDDING_DEPLOYMENT,
      input: lastUserMessage.content,
    });
    paperExcerpts = retrieveRelevantChunks(embeddingRes.data[0].embedding, 3);
  } catch {
    // RAG is a bonus, not a dependency -- if embeddings fail, fall through
    // and answer from the numeric chart context alone.
  }

  // Ground the model's answer in exactly what's currently plotted, rather
  // than letting it guess at numbers. See systemPrompt.ts rule 3.
  const contextBlock = [
    "Current chart context (JSON) -- the only data you may cite numbers from:",
    JSON.stringify({ cohort, points }, null, 2),
    ...(paperExcerpts.length > 0
      ? [
          "\nRelevant excerpts from the paper's own walkthrough (use these to explain concepts/methodology in plain language; they are not chart data):",
          ...paperExcerpts.map((c) => `--- ${c.heading} ---\n${c.text}`),
        ]
      : []),
  ].join("\n");

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: PAPER_CONTEXT },
    ...messages.slice(0, -1).map((m): OpenAI.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `${contextBlock}\n\nUser question: ${lastUserMessage.content}`,
    },
  ];

  let stream;
  try {
    stream = await getClient().chat.completions.create({
      model: DEPLOYMENT,
      max_tokens: 1024,
      messages: chatMessages,
      stream: true,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const body_ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        const message = error instanceof OpenAI.APIError ? error.message : "Stream error";
        controller.enqueue(encoder.encode(`\n\n[error: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body_, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
