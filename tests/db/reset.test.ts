import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, HAS_ATLAS, principalA, unitVector, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";
import { resetAll, SEED_PRINCIPALS, SEED_MEMORY_IDS } from "../../src/db/seed.js";
import { createEmbedder } from "../../src/db/embedder.js";
import { waitForIndexReady, VECTOR_INDEX_NAME } from "../../src/db/vector-index.js";

let t: TestDb; const embedder = createEmbedder();
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); await embedder.embed("warm up the model"); }, 300_000);
afterAll(async () => { await t.stop(); });

describe("A6 seed + reset", () => {
  it("reset_restores_seed_data_in_under_10_seconds", async () => {
    // dirty the database first: junk memory, tombstone, trace
    await t.db.collection("memories").insertOne({ _id: "junk" as any, tenantId: "x", scopeId: "s", expiresAtMs: 1, status: "active" });
    await t.db.collection("tombstones").insertOne({ _id: "tj" as any, tenantId: "x", targetId: "seed_a_team_fix" });
    const t0 = performance.now();
    await resetAll(t.db, embedder, { nowMs: () => 1_700_000_000_000 });
    const ms = performance.now() - t0;
    console.log(`reset took ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(10_000);
    expect(await t.db.collection("memories").countDocuments({ _id: "junk" as any })).toBe(0);
    expect(await t.db.collection("tombstones").countDocuments()).toBe(0);
    expect(await t.db.collection("principals").countDocuments()).toBe(SEED_PRINCIPALS.length);
    expect(await t.db.collection("memories").countDocuments()).toBe(SEED_MEMORY_IDS.length);
  });
  it("seed_has_two_tenants_and_a_similar_unrelated_memory", async () => {
    const repo = new MongoMemoryRepo(t.db);
    const a = await repo.getById(principalA, "seed_a_team_fix");
    const similar = await repo.getById(principalA, "seed_a_similar_other_service");
    expect(a?.value).toMatchObject({ action: "restart_cache_pool" });
    expect(similar?.appliesTo.service).not.toBe(a?.appliesTo.service);
    const tenants = new Set((await t.db.collection("memories").distinct("tenantId")) as string[]);
    expect(tenants).toEqual(new Set(["tenantA", "tenantB"]));
  });
  it("reset_is_repeatable", async () => {
    await resetAll(t.db, embedder, { nowMs: () => 1_700_000_000_000 });
    await resetAll(t.db, embedder, { nowMs: () => 1_700_000_000_000 });
    expect(await t.db.collection("memories").countDocuments()).toBe(SEED_MEMORY_IDS.length);
  });
  it.skipIf(!HAS_ATLAS)("p95_vectorSearch_under_300ms_on_seed_set", async () => {
    await resetAll(t.db, embedder, { nowMs: () => 1_700_000_000_000 });
    await waitForIndexReady(t.db, VECTOR_INDEX_NAME, 240_000);
    const repo = new MongoMemoryRepo(t.db);
    const q = { vector: await embedder.embed("5xx spike after deploy checkout-service"), scopeIds: ["team:tenantA"], nowMs: 1_700_000_000_000, limit: 5 };
    for (let i = 0; i < 60 && (await repo.vectorSearch(principalA, q)).length === 0; i++) await new Promise((r) => setTimeout(r, 2000));
    const times: number[] = [];
    for (let i = 0; i < 50; i++) { const s = performance.now(); await repo.vectorSearch(principalA, { ...q, vector: unitVector(i) }); times.push(performance.now() - s); }
    times.sort((x, y) => x - y);
    const p95 = times[Math.ceil(0.95 * times.length) - 1];
    console.log(`p95 vectorSearch: ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThan(300);
  }, 400_000);
});
