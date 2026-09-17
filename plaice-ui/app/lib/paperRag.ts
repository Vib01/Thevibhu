import ragIndexJson from "../../data/paper-rag-index.json";

// Retrieval over NN_TMB.html (the interactive walkthrough of arXiv:2608.31133,
// the exact paper this app's model comes from), so the chat panel can explain
// *how the model works* in plain language, not just cite chart numbers.
// Corpus is baked offline (scripts/build-rag-index.mjs) with Azure AI
// Foundry's text-embedding-3-small; only the user's query is embedded live.

interface RagChunk {
  id: string;
  heading: string;
  text: string;
  embedding: number[];
}

const ragIndex = ragIndexJson as RagChunk[];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RetrievedChunk {
  heading: string;
  text: string;
  score: number;
}

export function retrieveRelevantChunks(queryEmbedding: number[], topK = 3): RetrievedChunk[] {
  return ragIndex
    .map((chunk) => ({
      heading: chunk.heading,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
