import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, makeMemory, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { waitForIndexReady } from "../../src/db/vector-index.js";

let t: TestDb;
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); });
afterAll(async () => { await t.stop(); });

describe("A1 bootstrap", () => {
  it("validator_rejects_missing_tenantId", async () => {
    const { tenantId, ...doc } = makeMemory();
    await expect(t.db.collection("memories").insertOne(doc as any)).rejects.toThrow(/validation/i);
  });
  it("validator_rejects_missing_expiresAtMs", async () => {
    const { expiresAtMs, ...doc } = makeMemory();
    await expect(t.db.collection("memories").insertOne(doc as any)).rejects.toThrow(/validation/i);
  });
  it("validator_rejects_missing_tenantId_on_audit_and_traces", async () => {
    await expect(t.db.collection("audit").insertOne({ traceId: "x" } as any)).rejects.toThrow(/validation/i);
    await expect(t.db.collection("agent_traces").insertOne({ traceId: "x" } as any)).rejects.toThrow(/validation/i);
  });
  it("validator_accepts_valid_memory", async () => {
    await t.db.collection("memories").insertOne(makeMemory() as any);
  });
  it("unique_claimKey_version_per_tenant", async () => {
    const a = makeMemory({ claimKey: "dup/key", version: 1 });
    const b = makeMemory({ claimKey: "dup/key", version: 1 });
    await t.db.collection("memories").insertOne(a as any);
    await expect(t.db.collection("memories").insertOne(b as any)).rejects.toThrow(/duplicate key/i);
    // same claimKey+version in another tenant is fine
    await t.db.collection("memories").insertOne(makeMemory({ claimKey: "dup/key", version: 1, tenantId: "tenantB", scopeId: "team:tenantB" }) as any);
  });
  it("creates_cleanup_indexes_including_ttl_and_derivedFrom", async () => {
    const idx = await t.db.collection("memories").indexes();
    const names = idx.map((i) => i.name);
    expect(names).toContain("tenant_scope_status_expiry");
    expect(names).toContain("claimKey_tenant_scope");
    expect(names).toContain("derivedFrom_1");
    const ttl = idx.find((i) => i.name === "purgeAt_ttl");
    expect(ttl?.expireAfterSeconds).toBe(0);
    const trace = (await t.db.collection("agent_traces").indexes()).find((i) => i.name === "trace_ttl_7d");
    expect(trace?.expireAfterSeconds).toBe(7 * 24 * 3600);
  });
  it("bootstrap_is_idempotent", async () => {
    await bootstrap(t.db, { vectorIndex: HAS_ATLAS });
    await bootstrap(t.db, { vectorIndex: HAS_ATLAS });
    const names = (await t.db.listCollections().toArray()).map((c) => c.name);
    for (const n of ["memories", "principals", "audit", "tombstones", "eval_runs", "agent_traces"]) expect(names).toContain(n);
  });
  it.skipIf(!HAS_ATLAS)("vector_index_reaches_READY", async () => {
    await waitForIndexReady(t.db, "memory_vector_index", 240_000);
  });
});
