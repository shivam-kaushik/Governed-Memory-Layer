import type { Db } from "mongodb";
import { EMBEDDING_DIMS } from "../contracts/contracts.js";

export const VECTOR_INDEX_NAME = "memory_vector_index";

// Plan 4.3
export const vectorIndexDefinition = {
  fields: [
    { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMS, similarity: "cosine" },
    { type: "filter", path: "tenantId" },
    { type: "filter", path: "scopeId" },
    { type: "filter", path: "status" },
    { type: "filter", path: "validFromMs" },
    { type: "filter", path: "expiresAtMs" },
  ],
};

export async function ensureVectorIndex(db: Db): Promise<void> {
  const memories = db.collection("memories");
  const existing = await memories.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
  if (existing.length > 0) return;
  await memories.createSearchIndex({ name: VECTOR_INDEX_NAME, type: "vectorSearch", definition: vectorIndexDefinition });
}

export async function waitForIndexReady(db: Db, name: string, timeoutMs: number): Promise<void> {
  const memories = db.collection("memories");
  const pollMs = 2000;
  for (let waited = 0; ; waited += pollMs) {
    const [idx] = (await memories.listSearchIndexes(name).toArray()) as Array<{ status?: string; queryable?: boolean }>;
    if (idx?.status === "READY" && idx.queryable !== false) return;
    if (waited >= timeoutMs) throw new Error(`search index ${name} not READY within ${timeoutMs}ms (status: ${idx?.status ?? "missing"})`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
