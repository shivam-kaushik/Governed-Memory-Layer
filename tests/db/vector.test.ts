import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, makeMemory, unitVector, principalA, principalB, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { waitForIndexReady, VECTOR_INDEX_NAME } from "../../src/db/vector-index.js";
import { MongoMemoryRepo, buildVectorSearchPipeline } from "../../src/db/mongo-memory-repo.js";
import { createEmbedder } from "../../src/db/embedder.js";

const q = { vector: unitVector(1), scopeIds: ["team:tenantA", "private:alice"], nowMs: 1000, limit: 5 };

describe("A3 embedder", () => {
  it("embed_is_384_and_normalized", async () => {
    const e = createEmbedder();
    const v = await e.embed("restart the cache pool after a 5xx spike");
    expect(v).toHaveLength(384);
    expect(Math.sqrt(v.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 4);
  }, 180_000);
});

describe("A3 pipeline construction (no DB needed)", () => {
  it("prefilter_has_tenant_scope_status_validity_expiry", () => {
    const [stage] = buildVectorSearchPipeline(principalA, q);
    const vs = (stage as any).$vectorSearch;
    expect(vs.index).toBe("memory_vector_index");
    expect(vs.path).toBe("embedding");
    expect(vs.numCandidates).toBe(200);
    expect(vs.limit).toBe(5);
    expect(vs.filter.$and).toEqual([
      { tenantId: { $eq: "tenantA" } },
      { scopeId: { $in: ["team:tenantA", "private:alice"] } },
      { status: { $eq: "active" } },
      { validFromMs: { $lte: 1000 } },
      { expiresAtMs: { $gt: 1000 } },
    ]);
  });
  it("tenant_comes_from_principal_not_query", () => {
    const forged = { ...q, tenantId: "tenantB", filter: { tenantId: "tenantB" } } as any;
    const vs = (buildVectorSearchPipeline(principalA, forged)[0] as any).$vectorSearch;
    expect(JSON.stringify(vs.filter)).not.toContain("tenantB");
  });
  it("projects_score_and_id_only", () => {
    const [, project] = buildVectorSearchPipeline(principalA, q);
    expect(project).toEqual({ $project: { _id: 1, score: { $meta: "vectorSearchScore" } } });
  });
  it("exact_mode_drops_numCandidates", () => {
    const vs = (buildVectorSearchPipeline(principalA, q, true)[0] as any).$vectorSearch;
    expect(vs.exact).toBe(true);
    expect(vs.numCandidates).toBeUndefined();
  });
  it("empty_scopes_returns_nothing_without_querying", async () => {
    const repo = new MongoMemoryRepo(null as any);
    expect(await repo.vectorSearch(principalA, { ...q, scopeIds: [] })).toEqual([]);
  });
});

describe.skipIf(!HAS_ATLAS)("A3 vectorSearch on Atlas", () => {
  let t: TestDb; let repo: MongoMemoryRepo;
  const E = 50_000;
  const ids: Record<string, string> = {};
  async function visible(p = principalA, query = q, want: string[] = []) {
    for (let i = 0; i < 60; i++) {
      const got = (await repo.vectorSearch(p, query)).map((r) => r.id);
      if (want.every((w) => got.includes(w))) return got;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return (await repo.vectorSearch(p, query)).map((r) => r.id);
  }
  beforeAll(async () => {
    t = await startTestDb(); await bootstrap(t.db, { vectorIndex: true });
    await waitForIndexReady(t.db, VECTOR_INDEX_NAME, 240_000);
    repo = new MongoMemoryRepo(t.db);
    const base = { embedding: unitVector(1) };
    const mk = async (k: string, over: any) => { const m = makeMemory({ ...base, ...over }); ids[k] = m._id; await repo.insert(over.tenantId === "tenantB" ? principalB : principalA, m); };
    await mk("ok", { expiresAtMs: E });
    await mk("other_tenant", { tenantId: "tenantB", scopeId: "team:tenantB", expiresAtMs: E });
    await mk("other_scope", { scopeId: "private:carol", expiresAtMs: E });
    await mk("superseded", { status: "superseded", expiresAtMs: E });
  }, 600_000);
  afterAll(async () => { await t.stop(); });

  it("excludes_other_tenant", async () => { const got = await visible(principalA, { ...q, nowMs: E - 1 }, [ids.ok]); expect(got).not.toContain(ids.other_tenant); });
  it("excludes_other_scope", async () => { const got = await visible(principalA, { ...q, nowMs: E - 1 }, [ids.ok]); expect(got).not.toContain(ids.other_scope); });
  it("excludes_status_not_active", async () => { const got = await visible(principalA, { ...q, nowMs: E - 1 }, [ids.ok]); expect(got).not.toContain(ids.superseded); });
  it("excludes_expired_at_boundary", async () => {
    expect(await visible(principalA, { ...q, nowMs: E - 1 }, [ids.ok])).toContain(ids.ok);
    expect(await repo.vectorSearch(principalA, { ...q, nowMs: E })).toEqual([]);
    expect(await repo.vectorSearch(principalA, { ...q, nowMs: E + 1 })).toEqual([]);
  });
  it("ann_recall_at_5_ge_95pct_vs_exact", async () => {
    const docs = Array.from({ length: 150 }, (_, i) => makeMemory({ embedding: unitVector(100 + i), expiresAtMs: E, claimKey: `ann/${i}` }));
    for (const d of docs) await repo.insert(principalA, d);
    const probe = { vector: unitVector(100), scopeIds: ["team:tenantA"], nowMs: E - 1, limit: 5 };
    await visible(principalA, probe, [docs[0]._id]);
    let hit = 0, total = 0;
    for (let i = 0; i < 50; i++) {
      const qq = { ...probe, vector: unitVector(100 + i * 3) };
      const exact = (await repo.vectorSearch(principalA, qq, { exact: true })).map((r) => r.id);
      const ann = new Set((await repo.vectorSearch(principalA, qq)).map((r) => r.id));
      total += exact.length; hit += exact.filter((x) => ann.has(x)).length;
    }
    expect(hit / total).toBeGreaterThanOrEqual(0.95);
  }, 300_000);
});
