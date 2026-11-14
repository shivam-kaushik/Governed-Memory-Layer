import { describe, expect, it } from "vitest";
import { recall } from "../../src/core/recall";
import { createVoyageReranker, voyageFromEnv } from "../../src/core/voyage";
import { DAY, caller, query, setup } from "./helpers";

const okFetch = (scores: number[], calls: { url: string; body: any; auth: string }[] = []) =>
  (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(JSON.stringify({ data: scores.map((relevance_score, index) => ({ index, relevance_score })) }), { status: 200 });
  }) as unknown as typeof fetch;

describe("voyage reranker", () => {
  it("posts query and documents with bearer key and returns scores aligned to input order", async () => {
    const calls: { url: string; body: any; auth: string }[] = [];
    const rr = createVoyageReranker({ apiKey: "k", fetch: okFetch([0.2, 0.9], calls) });
    // API may return out of order: aligned by index
    const out = await rr("q", ["a", "b"]);
    expect(out).toEqual([0.2, 0.9]);
    expect(calls[0]!.url).toBe("https://api.voyageai.com/v1/rerank");
    expect(calls[0]!.auth).toBe("Bearer k");
    expect(calls[0]!.body).toMatchObject({ query: "q", documents: ["a", "b"], model: "rerank-2.5" });
  });

  it("returns null on http error or throw (ranking falls back, never blocks)", async () => {
    const bad = createVoyageReranker({ apiKey: "k", fetch: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    expect(await bad("q", ["a"])).toBeNull();
    const boom = createVoyageReranker({ apiKey: "k", fetch: (async () => { throw new Error("net"); }) as unknown as typeof fetch });
    expect(await boom("q", ["a"])).toBeNull();
  });

  it("voyageFromEnv is undefined without key", () => {
    expect(voyageFromEnv({})).toBeUndefined();
    expect(voyageFromEnv({ VOYAGE_API_KEY: "k" })).toBeTypeOf("function");
  });
});

describe("recall with reranker", () => {
  it("reranker reorders eligible cards only and never resurrects an ineligible memory", async () => {
    const { deps, seed, clock } = setup();
    const a = await seed({ claimKey: "c/a", text: "checkout 5xx cache pool cp-aaaaaa", value: { pool: "cp-aaaaaa" } });
    const b = await seed({ claimKey: "c/b", text: "checkout 5xx cache pool cp-bbbbbb", value: { pool: "cp-bbbbbb" } });
    const dead = await seed({ claimKey: "c/dead", text: "checkout 5xx cache pool cp-dddddd", value: { pool: "cp-dddddd" }, ttlMs: DAY });
    clock.advanceMs!(2 * DAY); // dead is expired for all three? seed ttl 7d for a,b; dead 1d
    const seen: string[][] = [];
    deps.reranker = async (_q, texts) => { seen.push(texts); return texts.map((t) => (t.includes("bbbbbb") ? 1 : 0)); };
    const r = await recall(deps, query(), caller());
    expect(r.cards[0]!.memoryId).toBe(b.id);
    expect(r.cards.map((c) => c.memoryId)).not.toContain(dead.id);
    expect(seen[0]!.some((t) => t.includes("dddddd"))).toBe(false); // expired text never leaves the process
    expect(r.cards.map((c) => c.memoryId)).toContain(a.id);
  });

  it("falls back to local ranking when the reranker returns null or throws", async () => {
    const { deps, seed } = setup();
    const m = await seed();
    deps.reranker = async () => null;
    expect((await recall(deps, query(), caller())).cards[0]!.memoryId).toBe(m.id);
    deps.reranker = async () => { throw new Error("down"); };
    expect((await recall(deps, query(), caller())).cards[0]!.memoryId).toBe(m.id);
  });
});
