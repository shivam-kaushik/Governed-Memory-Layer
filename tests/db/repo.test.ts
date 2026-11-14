import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb, makeMemory, principalA, principalB, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoMemoryRepo, derivedQuery, PURGE_GRACE_MS } from "../../src/db/mongo-memory-repo.js";

let t: TestDb;
let repo: MongoMemoryRepo;
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); repo = new MongoMemoryRepo(t.db); });
afterAll(async () => { await t.stop(); });
beforeEach(async () => { await t.db.collection("memories").deleteMany({}); await t.db.collection("tombstones").deleteMany({}); });

describe("A2 MongoMemoryRepo", () => {
  it("getById_other_tenant_returns_null", async () => {
    const m = makeMemory();
    await repo.insert(principalA, m);
    expect(await repo.getById(principalA, m._id)).not.toBeNull();
    expect(await repo.getById(principalB, m._id)).toBeNull();
  });
  it("byIds_other_tenant_returns_empty", async () => {
    const a = makeMemory(); const b = makeMemory({ tenantId: "tenantB", scopeId: "team:tenantB" });
    await repo.insert(principalA, a); await repo.insert(principalB, b);
    expect((await repo.byIds(principalA, [a._id, b._id])).map((m) => m._id)).toEqual([a._id]);
    expect(await repo.byIds(principalB, [a._id])).toEqual([]);
  });
  it("insert_ignores_forged_tenantId_and_uses_principal", async () => {
    const m = makeMemory({ tenantId: "tenantB" });
    await repo.insert(principalA, m);
    const raw = await t.db.collection("memories").findOne({ _id: m._id as any });
    expect(raw?.tenantId).toBe("tenantA");
  });
  it("findActiveByClaimKey_scoped_to_scopeIds", async () => {
    const team = makeMemory({ claimKey: "k", scopeId: "team:tenantA" });
    const priv = makeMemory({ claimKey: "k", version: 2, scopeId: "private:alice" });
    const otherPriv = makeMemory({ claimKey: "k", version: 3, scopeId: "private:carol" });
    const superseded = makeMemory({ claimKey: "k", version: 4, status: "superseded" });
    for (const m of [team, priv, otherPriv, superseded]) await repo.insert(principalA, m);
    const got = await repo.findActiveByClaimKey(principalA, ["team:tenantA", "private:alice"], "k");
    expect(got.map((m) => m._id).sort()).toEqual([team._id, priv._id].sort());
  });
  it("findDerived_uses_derivedFrom_index", async () => {
    const src = makeMemory(); const child = makeMemory({ derivedFrom: [src._id] });
    await repo.insert(principalA, src); await repo.insert(principalA, child);
    expect(await repo.findDerived(principalA, src._id)).toEqual([child._id]);
    expect(await repo.findDerived(principalB, src._id)).toEqual([]);
    const { filter, hint } = derivedQuery(principalA, src._id);
    const plan = JSON.stringify(await t.db.collection("memories").find(filter).hint(hint).explain("queryPlanner"));
    expect(plan).toContain("IXSCAN");
    expect(plan).toContain("derivedFrom_1");
  });
  it("insert_sets_purgeAt_after_expiry_plus_grace", async () => {
    const far = new Date().getTime() + 86_400_000;
    const m = makeMemory({ expiresAtMs: far });
    await repo.insert(principalA, m);
    const raw = await t.db.collection("memories").findOne({ _id: m._id as any });
    expect(raw?.purgeAt).toBeInstanceOf(Date);
    expect((raw!.purgeAt as Date).getTime()).toBe(far + PURGE_GRACE_MS);
  });
  it("purgeAt_never_in_the_past_even_with_small_logical_timestamps", async () => {
    // A fake/logical clock with tiny timestamps must not let the real-time TTL sweeper delete live memories.
    const m = makeMemory({ expiresAtMs: 5_000_000 });
    await repo.insert(principalA, m);
    const raw = await t.db.collection("memories").findOne({ _id: m._id as any });
    expect((raw!.purgeAt as Date).getTime()).toBeGreaterThan(new Date().getTime());
  });
  it("setStatus_is_tenant_scoped", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    await repo.setStatus(principalB, m._id, "deleted");
    expect((await repo.getById(principalA, m._id))?.status).toBe("active");
    await repo.setStatus(principalA, m._id, "disputed");
    expect((await repo.getById(principalA, m._id))?.status).toBe("disputed");
  });
  it("isTombstoned_matches_id_or_contentHash", async () => {
    await t.db.collection("tombstones").insertOne({ _id: "t1" as any, tenantId: "tenantA", targetId: "mem_x", contentHash: "hash_x", reason: "r", requestedBy: "alice", createdAtMs: 0, closure: { derivedIds: [], status: "verified" } });
    expect(await repo.isTombstoned(principalA, "mem_x")).toBe(true);
    expect(await repo.isTombstoned(principalA, "mem_other", "hash_x")).toBe(true);
    expect(await repo.isTombstoned(principalA, "mem_other", "hash_other")).toBe(false);
    expect(await repo.isTombstoned(principalB, "mem_x", "hash_x")).toBe(false);
  });
});
