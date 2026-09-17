// Builds the RAG index for the chat panel's "explain the paper" grounding.
//
// Source chunks (data/paper-chunks.json) are extracted verbatim, section by
// section, from ../NN_TMB.html -- the interactive walkthrough of the exact
// paper (arXiv:2608.31133) this app's model comes from. Re-extract with:
//
//   node -e "..." against NN_TMB.html's DOM (see git history / ask for the
//   Playwright extraction script) if the walkthrough content changes.
//
// This script embeds each chunk with Azure AI Foundry's text-embedding-3-small
// deployment and writes data/paper-rag-index.json (chunks + embeddings).
// Run once after paper-chunks.json changes -- the app only computes the
// (cheap, single) query embedding live; the corpus embeddings are baked,
// same pattern as the prediction grid.
//
// Usage: node scripts/build-rag-index.mjs   (needs .env.local loaded -- run
// via `node --env-file=.env.local scripts/build-rag-index.mjs` on Node 20+)

import { readFileSync, writeFileSync } from "fs";
import OpenAI from "openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small";

if (!endpoint || !apiKey) {
  console.error("Missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY. Run with --env-file=.env.local");
  process.exit(1);
}

const client = new OpenAI({ baseURL: endpoint, apiKey });

const chunks = JSON.parse(readFileSync(new URL("../data/paper-chunks.json", import.meta.url)));

const indexed = [];
for (const chunk of chunks) {
  console.log("Embedding:", chunk.id);
  const res = await client.embeddings.create({
    model: embeddingDeployment,
    input: `${chunk.heading}\n\n${chunk.text}`,
  });
  indexed.push({ ...chunk, embedding: res.data[0].embedding });
}

writeFileSync(
  new URL("../data/paper-rag-index.json", import.meta.url),
  JSON.stringify(indexed)
);
console.log(`Wrote data/paper-rag-index.json (${indexed.length} chunks, ${indexed[0].embedding.length}-dim embeddings)`);
