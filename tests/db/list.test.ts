import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb, makeMemory, principalA, principalB, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";
import { MongoAuditStore } from "../../src/db/mongo-audit-store.js";
import type { AuditEvent } from "../../src/contracts/contracts.js";

let t: TestDb;
let repo: MongoMemoryRepo;
let audit: MongoAuditStore;
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); repo = new MongoMemoryRepo(t.db); audit = new MongoAuditStore(t.db); });
afterAll(async () => { await t.stop(); });
beforeEach(async () => { await t.db.collection("memories").deleteMany({}); await t.db.collection("audit").deleteMany({}); });

const ev = (over: Partial<AuditEvent>): AuditEvent => ({
  traceId: "tr", tenantId: "tenantA", actorId: "alice", purpose: "incident-triage", op: "recall", decision: "allow",
  reasonCodes: [], selectedIds: [], rejectedIds: [], queryHash: "q", createdAtMs: 1, ...over,
});

describe("dashboard reads (B integration, joint edit)", () => {
  it("listMemories_is_tenant_injected_and_scope_limited", async () => {
    const team = makeMemory({ _id: "m_team" });
    const mine = makeMemory({ _id: "m_priv", scopeId: "private:alice" });
    const other = makeMemory({ _id: "m_other_scope", scopeId: "private:rita" });
    const b = makeMemory({ _id: "m_b", tenantId: "tenantB", scopeId: "team:tenantB" });
    for (const [p, m] of [[principalA, team], [principalA, mine], [principalA, other], [principalB, b]] as const) await repo.insert(p, m);
    const got = await repo.listMemories(principalA, ["team:tenantA", "private:alice"]);
    expect(got.map((m) => m._id).sort()).toEqual(["m_priv", "m_team"]);
    expect(await repo.listMemories(principalA, ["team:tenantB"])).toEqual([]); // foreign scope under own tenant filter
  });

  it("listAudit_is_tenant_injected_newest_first_and_limited", async () => {
    await audit.record(ev({ _id: "a1", createdAtMs: 10 }));
    await audit.record(ev({ _id: "a2", createdAtMs: 30 }));
    await audit.record(ev({ _id: "a3", createdAtMs: 20 }));
    await audit.record(ev({ _id: "b1", tenantId: "tenantB", createdAtMs: 99 }));
    expect((await audit.list(principalA, 10)).map((e) => e._id)).toEqual(["a2", "a3", "a1"]);
    expect((await audit.list(principalA, 2)).map((e) => e._id)).toEqual(["a2", "a3"]);
    expect((await audit.list(principalB, 10)).map((e) => e._id)).toEqual(["b1"]);
  });
});
