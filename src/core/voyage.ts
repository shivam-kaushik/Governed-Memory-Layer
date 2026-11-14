// Voyage AI rerank: ranking signal only. Called after the policy recheck, so it never sees ineligible memory text.
export type Reranker = (query: string, documents: string[]) => Promise<number[] | null>;

export function createVoyageReranker(o: { apiKey: string; model?: string; fetch?: typeof fetch }): Reranker {
  const f = o.fetch ?? fetch;
  return async (query, documents) => {
    try {
      const res = await f("https://api.voyageai.com/v1/rerank", {
        method: "POST",
        headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, documents, model: o.model ?? "rerank-2.5" }),
      });
      if (!res.ok) return null;
      const { data } = (await res.json()) as { data: { index: number; relevance_score: number }[] };
      const out = documents.map(() => 0);
      for (const d of data) out[d.index] = d.relevance_score;
      return out;
    } catch {
      return null;
    }
  };
}

export function voyageFromEnv(env: Record<string, string | undefined>, f?: typeof fetch): Reranker | undefined {
  const apiKey = env["VOYAGE_API_KEY"];
  return apiKey ? createVoyageReranker({ apiKey, ...(f ? { fetch: f } : {}) }) : undefined;
}
