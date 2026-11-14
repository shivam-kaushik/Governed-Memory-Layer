import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { startTestDb, makeMemory, principalA, principalB, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";

let t: TestDb;
let repo: MongoMemoryRepo;
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); repo = new MongoMemoryRepo(t.db); });
afterAll(async () => { await t.stop(); });
beforeEach(async () => { await t.db.collection("memories").deleteMany({}); await t.db.collection("tombstones").deleteMany({}); });

// Db whose `collection(name).insertOne` throws on the Nth call: forces a mid-transaction failure.
function failingDb(db: Db, collName: string, failOnCall: number): Db {
  let calls = 0;
  return new Proxy(db, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (prop !== "collection") return typeof v === "function" ? v.bind(target) : v;
      return (name: string) => {
        const c = target.collection(name);
        if (name !== collName) return c;
        return new Proxy(c, {
          get(ct, cp) {
            const cv = Reflect.get(ct, cp, ct);
            if (cp !== "insertOne") return typeof cv === "function" ? cv.bind(ct) : cv;
            return (...args: any[]) => { if (++calls === failOnCall) throw new Error("injected failure"); return (cv as any).apply(ct, args); };
          },
        });
      };
    },
  }) as Db;
}

describe("A4 lifecycle persistence", () => {
  it("supersede_is_atomic", async () => {
    const old = makeMemory({ claimKey: "c", version: 1 });
    await repo.insert(principalA, old);
    const next = makeMemory({ claimKey: "c", version: 2, supersedes: old._id });
    const broken = new MongoMemoryRepo(failingDb(t.db, "memories", 1));
    await expect(broken.supersede(principalA, old._id, next)).rejects.toThrow(/injected/);
    expect((await repo.getById(principalA, old._id))?.status).toBe("active");
    expect(await repo.getById(principalA, next._id)).toBeNull();
  });
  it("supersede_happy_path_marks_old_and_inserts_new", async () => {
    const old = makeMemory({ claimKey: "c2", version: 1 });
    await repo.insert(principalA, old);
    const next = makeMemory({ claimKey: "c2", version: 2 });
    await repo.supersede(principalA, old._id, next);
    expect((await repo.getById(principalA, old._id))?.status).toBe("superseded");
    const n = await repo.getById(principalA, next._id);
    expect(n?.status).toBe("active"); expect(n?.supersedes).toBe(old._id);
  });
  it("supersede_refuses_other_tenant_target", async () => {
    const old = makeMemory({ claimKey: "c3" }); await repo.insert(principalA, old);
    await expect(repo.supersede(principalB, old._id, makeMemory({ tenantId: "tenantB", scopeId: "team:tenantB", version: 2 }))).rejects.toThrow();
    expect((await repo.getById(principalA, old._id))?.status).toBe("active");
  });
  it("tombstoneAndPurge_is_atomic", async () => {
    const a = makeMemory(); const b = makeMemory();
    await repo.insert(principalA, a); await repo.insert(principalA, b);
    const broken = new MongoMemoryRepo(failingDb(t.db, "tombstones", 2));
    await expect(broken.tombstoneAndPurge(principalA, [a._id, b._id], "r")).rejects.toThrow(/injected/);
    expect(await repo.getById(principalA, a._id)).not.toBeNull();
    expect(await repo.getById(principalA, b._id)).not.toBeNull();
    expect(await t.db.collection("tombstones").countDocuments()).toBe(0);
  });
  it("purge_removes_content_and_embedding_keeps_hash_only", async () => {
    const m = makeMemory({ text: "SECRET-CANARY-xyz" }); await repo.insert(principalA, m);
    const { tombstoneIds } = await repo.tombstoneAndPurge(principalA, [m._id], "gdpr");
    expect(tombstoneIds).toHaveLength(1);
    expect(await repo.getById(principalA, m._id)).toBeNull();
    const tomb = await t.db.collection("tombstones").findOne({ targetId: m._id });
    expect(tomb?.contentHash).toBe(m.contentHash);
    const dump = JSON.stringify(tomb);
    expect(dump).not.toContain("SECRET-CANARY");
    expect(dump).not.toContain("embedding");
    expect(await repo.isTombstoned(principalA, m._id)).toBe(true);
  });
  it("tombstone_createdAtMs_comes_from_injected_clock", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    const clocked = new MongoMemoryRepo(t.db, { nowMs: () => 424242 });
    await clocked.tombstoneAndPurge(principalA, [m._id], "r");
    expect((await t.db.collection("tombstones").findOne({ targetId: m._id }))?.createdAtMs).toBe(424242);
  });
  it("tombstone_blocks_reinsert_of_same_id_or_hash", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    await repo.tombstoneAndPurge(principalA, [m._id], "r");
    await expect(repo.insert(principalA, makeMemory({ _id: m._id }))).rejects.toThrow(/TOMBSTONED/);
    await expect(repo.insert(principalA, makeMemory({ contentHash: m.contentHash }))).rejects.toThrow(/TOMBSTONED/);
    await repo.insert(principalA, makeMemory()); // unrelated still allowed (relearning)
  });
  it("expireDue_flips_status_at_boundary_only", async () => {
    const m = makeMemory({ expiresAtMs: 1000 }); await repo.insert(principalA, m);
    expect(await repo.expireDue(999)).toEqual([]);
    expect((await repo.getById(principalA, m._id))?.status).toBe("active");
    expect(await repo.expireDue(1000)).toEqual([m._id]);
    expect((await repo.getById(principalA, m._id))?.status).toBe("expired");
    expect(await repo.expireDue(2000)).toEqual([]);
  });
  it("replayTombstones_re_deletes_restored_docs", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    await repo.tombstoneAndPurge(principalA, [m._id], "r");
    await t.db.collection("memories").insertOne({ ...m } as any); // simulated restore bypassing the repo
    const byHash = makeMemory({ contentHash: m.contentHash });
    await t.db.collection("memories").insertOne(byHash as any);
    expect(await repo.replayTombstones()).toBe(2);
    expect(await repo.getById(principalA, m._id)).toBeNull();
    expect(await repo.getById(principalA, byHash._id)).toBeNull();
  });
  it("purge_leaves_unrelated_similar_memory", async () => {
    const target = makeMemory({ text: "restart pool cp-7f3a" });
    const similar = makeMemory({ text: "restart pool cp-7f3a", embedding: target.embedding });
    await repo.insert(principalA, target); await repo.insert(principalA, similar);
    await repo.tombstoneAndPurge(principalA, [target._id], "r");
    expect(await repo.getById(principalA, similar._id)).not.toBeNull();
  });
});
