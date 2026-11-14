import type { Embedder } from "../contracts/contracts";

const DIMS = 384;

// Deterministic bag-of-words hash embedding. Plumbing only: NOT semantic quality.
export class FakeEmbedder implements Embedder {
  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(DIMS).fill(0);
    for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) h = Math.imul(h ^ tok.charCodeAt(i), 16777619) >>> 0;
      v[h % DIMS]! += (h >>> 31) & 1 ? -1 : 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm === 0) {
      v[0] = 1;
      return v;
    }
    return v.map((x) => x / norm);
  }
}
