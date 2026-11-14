import { pipeline, env } from "@xenova/transformers";
import type { Embedder } from "../contracts/contracts.js";
import { EMBEDDING_MODEL } from "../contracts/contracts.js";

env.allowLocalModels = true;

// In-process embeddings: no outside service sees memory text. Model pinned to EMBEDDING_MODEL (384-d).
export function createEmbedder(): Embedder {
  let extractor: Promise<any> | null = null;
  return {
    async embed(text: string): Promise<number[]> {
      extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL);
      const out = await (await extractor)(text, { pooling: "mean", normalize: true });
      return Array.from(out.data as Float32Array);
    },
  };
}
