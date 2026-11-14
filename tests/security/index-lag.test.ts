import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, makeMemory, unitVector, principalA, HAS_ATLAS, type TestDb } from "../db/helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { waitForIndexReady, VECTOR_INDEX_NAME } from "../../src/db/vector-index.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";

let t: TestDb; let repo: MongoMemoryRepo;
beforeAll(async () => {
  t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); repo = new MongoMemoryRepo(t.db);
  if (HAS_ATLAS) await waitForIndexReady(t.db, VECTOR_INDEX_NAME, 240_000);
}, 300_000);
afterAll(async () => { await t.stop(); });

describe("A6 index lag (G5)", () => {
  it("byIds_and_getById_exclude_a_doc_marked_deleted_directly_in_the_db", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    expect(await repo.byIds(principalA, [m._id])).toHaveLength(1);
    await t.db.collection("memories").updateOne({ _id: m._id as any }, { $set: { status: "deleted" } }); // bypasses the index
    expect(await repo.byIds(principalA, [m._id])).toEqual([]);
    expect(await repo.getById(principalA, m._id)).toBeNull();
  });
  it("byIds_keeps_expired_and_superseded_docs_so_callers_can_give_reason_codes", async () => {
    const m = makeMemory(); await repo.insert(principalA, m);
    await t.db.collection("memories").updateOne({ _id: m._id as any }, { $set: { status: "superseded" } });
    expect((await repo.byIds(principalA, [m._id]))[0].status).toBe("superseded");
  });
  it.skipIf(!HAS_ATLAS)("stale_vectorSearch_candidate_is_rejected_by_byIds", async () => {
    const m = makeMemory({ embedding: unitVector(7), expiresAtMs: 9_000_000 });
    await repo.insert(principalA, m);
    const q = { vector: unitVector(7), scopeIds: ["team:tenantA"], nowMs: 1000, limit: 5 };
    for (let i = 0; i < 60 && !(await repo.vectorSearch(principalA, q)).some((r) => r.id === m._id); i++) await new Promise((r) => setTimeout(r, 2000));
    await t.db.collection("memories").updateOne({ _id: m._id as any }, { $set: { status: "deleted" } });
    // index may still list it (eventual consistency); the authoritative recheck must not return it either way
    expect(await repo.byIds(principalA, [m._id])).toEqual([]);
  }, 180_000);
});
