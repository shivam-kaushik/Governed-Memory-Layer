import { beforeEach, describe, expect, it } from "vitest";
import type { Memory, Principal, TraceEvent } from "../../src/contracts/contracts";
import { FakeAuditStore } from "../../src/fakes/fake-audit-store";
import { FakeClock } from "../../src/fakes/fake-clock";
import { FakeEmbedder } from "../../src/fakes/fake-embedder";
import { FakeEvalStore } from "../../src/fakes/fake-eval-store";
import { FakeMemoryRepo } from "../../src/fakes/fake-repo";
import { FakeTraceStore } from "../../src/fakes/fake-trace-store";

const NOW = 1_700_000_000_000;
const emb = new FakeEmbedder();
const pA: Principal = { id: "pA", tenantId: "tA", role: "responder", scopes: ["team:tA", "private:pA"], purposes: ["incident-triage"] };
const pB: Principal = { id: "pB", tenantId: "tB", role: "responder", scopes: ["team:tB", "private:pB"], purposes: ["incident-triage"] };

async function mem(o: Partial<Memory> & { _id: string }): Promise<Memory> {
  const text = o.text ?? "checkout 5xx after deploy: restart cache pool";
  return {
    tenantId: "tA",
    scopeId: "team:tA",
    purposeTags: ["incident-triage"],
    memoryType: "fix",
    claimKey: `claim/${o._id}`,
    text,
    value: { action: "restart_cache_pool", pool: "cp-aaaaaa" },
    appliesTo: { service: "checkout-service", versionRange: ">=2.0.0", environment: "prod" },
    embedding: await emb.embed(text),
    embeddingModel: "fake",
    contentHash: `h-${o._id}`,
    version: 1,
    derivedFrom: [],
    validFromMs: NOW - 1000,
    expiresAtMs: NOW + 10_000,
    status: "active",
    confidence: 0.9,
    sourceAuthority: 0.8,
    source: { type: "incident", ref: "inc-1" },
    createdBy: "pA",
    createdAtMs: NOW - 1000,
    policyVersion: "v1",
    ...o,
  };
}

describe("FakeClock", () => {
  it("starts at given time and advances", () => {
    const c = new FakeClock(NOW);
    expect(c.nowMs()).toBe(NOW);
    c.advanceMs!(5);
    expect(c.nowMs()).toBe(NOW + 5);
  });
});

describe("FakeEmbedder (fake_embedder: hash embedding, not semantic quality evidence)", () => {
  it("fake_embedder_is_384_and_normalized", async () => {
    const v = await emb.embed("hello world");
    expect(v).toHaveLength(384);
    expect(Math.sqrt(v.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 6);
  });
  it("fake_embedder_is_deterministic", async () => {
    expect(await emb.embed("same text")).toEqual(await emb.embed("same text"));
  });
  it("fake_embedder_similar_text_scores_higher", async () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
    const q = await emb.embed("checkout 5xx spike restart cache pool");
    const near = await emb.embed("checkout 5xx restart cache pool");
    const far = await emb.embed("quarterly marketing budget review");
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
});

describe("FakeMemoryRepo", () => {
  let repo: FakeMemoryRepo;
  beforeEach(() => {
    repo = new FakeMemoryRepo();
  });

  it("getById_other_tenant_returns_null", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    expect(await repo.getById(pB, "m1")).toBeNull();
    expect((await repo.getById(pA, "m1"))?._id).toBe("m1");
  });

  it("byIds_other_tenant_returns_empty", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    expect(await repo.byIds(pB, ["m1"])).toEqual([]);
  });

  it("findActiveByClaimKey_scoped_to_scopeIds_and_active_only", async () => {
    await repo.insert(pA, await mem({ _id: "m1", claimKey: "k" }));
    await repo.insert(pA, await mem({ _id: "m2", claimKey: "k", scopeId: "private:pA", version: 2 }));
    await repo.insert(pA, await mem({ _id: "m3", claimKey: "k", version: 3, status: "superseded" }));
    expect((await repo.findActiveByClaimKey(pA, ["team:tA"], "k")).map((m) => m._id)).toEqual(["m1"]);
    expect(await repo.findActiveByClaimKey(pB, ["team:tA"], "k")).toEqual([]);
  });

  it("insert_rejects_doc_with_foreign_tenantId", async () => {
    await expect(repo.insert(pA, await mem({ _id: "m1", tenantId: "tB", scopeId: "team:tB" }))).rejects.toThrow();
    expect(await repo.getById(pB, "m1")).toBeNull();
  });

  it("insert_allows_same_claimKey_version_in_different_scopes", async () => {
    await repo.insert(pA, await mem({ _id: "m1", claimKey: "k", scopeId: "private:pA" }));
    await expect(repo.insert(pA, await mem({ _id: "m2", claimKey: "k", scopeId: "team:tA" }))).resolves.toBeUndefined();
  });

  it("insert_rejects_duplicate_tenant_claimKey_version", async () => {
    await repo.insert(pA, await mem({ _id: "m1", claimKey: "k" }));
    await expect(repo.insert(pA, await mem({ _id: "m2", claimKey: "k" }))).rejects.toThrow();
  });

  it("vectorSearch_excludes_other_tenant_scope_and_inactive", async () => {
    await repo.insert(pA, await mem({ _id: "ok" }));
    await repo.insert(pA, await mem({ _id: "priv", scopeId: "private:pA" }));
    await repo.insert(pA, await mem({ _id: "quar", status: "quarantined" }));
    await repo.insert(pA, await mem({ _id: "sup", status: "superseded" }));
    await repo.insert(pB, await mem({ _id: "foreign", tenantId: "tB", scopeId: "team:tB" }));
    const vector = await emb.embed("checkout 5xx restart cache pool");
    const hits = await repo.vectorSearch(pA, { vector, scopeIds: ["team:tA"], nowMs: NOW, limit: 10 });
    expect(hits.map((h) => h.id)).toEqual(["ok"]);
  });

  it("vectorSearch_expiry_and_validFrom_boundaries", async () => {
    await repo.insert(pA, await mem({ _id: "m1", expiresAtMs: NOW }));
    const vector = await emb.embed("checkout 5xx restart cache pool");
    const q = (nowMs: number) => repo.vectorSearch(pA, { vector, scopeIds: ["team:tA"], nowMs, limit: 10 });
    expect((await q(NOW - 1)).map((h) => h.id)).toEqual(["m1"]);
    expect(await q(NOW)).toEqual([]);
    expect(await q(NOW + 1)).toEqual([]);
    await repo.insert(pA, await mem({ _id: "future", validFromMs: NOW + 5, expiresAtMs: NOW + 99 }));
    expect((await q(NOW - 1)).map((h) => h.id)).toEqual(["m1"]); // future not yet valid
  });

  it("index_lag_returns_stale_id_but_byIds_excludes_deleted", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    await repo.setStatus(pA, "m1", "deleted");
    repo.setIndexLag(true);
    const vector = await emb.embed("checkout 5xx restart cache pool");
    const hits = await repo.vectorSearch(pA, { vector, scopeIds: ["team:tA"], nowMs: NOW, limit: 10 });
    expect(hits.map((h) => h.id)).toContain("m1"); // stale index still returns it
    expect(await repo.byIds(pA, ["m1"])).toEqual([]); // authoritative recheck source says gone
  });

  it("returned docs are copies, not live references", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    const d = (await repo.getById(pA, "m1"))!;
    d.status = "deleted";
    expect((await repo.getById(pA, "m1"))?.status).toBe("active");
  });

  it("supersede_marks_old_superseded_and_inserts_new", async () => {
    await repo.insert(pA, await mem({ _id: "old", claimKey: "k" }));
    await repo.supersede(pA, "old", await mem({ _id: "new", claimKey: "k", version: 2, supersedes: "old" }));
    expect((await repo.getById(pA, "old"))?.status).toBe("superseded");
    expect((await repo.getById(pA, "new"))?.status).toBe("active");
  });

  it("supersede_is_atomic_when_new_doc_invalid", async () => {
    await repo.insert(pA, await mem({ _id: "old", claimKey: "k" }));
    await expect(
      repo.supersede(pA, "old", await mem({ _id: "new", claimKey: "k", version: 2, tenantId: "tB", scopeId: "team:tB" })),
    ).rejects.toThrow();
    expect((await repo.getById(pA, "old"))?.status).toBe("active");
    expect(await repo.getById(pA, "new")).toBeNull();
  });

  it("findDerived_returns_direct_children_only", async () => {
    await repo.insert(pA, await mem({ _id: "src" }));
    await repo.insert(pA, await mem({ _id: "child", derivedFrom: ["src"] }));
    await repo.insert(pA, await mem({ _id: "grandchild", derivedFrom: ["child"] }));
    expect(await repo.findDerived(pA, "src")).toEqual(["child"]);
    expect(await repo.findDerived(pB, "src")).toEqual([]);
  });

  it("tombstoneAndPurge_removes_content_and_records_tombstone", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    const { tombstoneIds } = await repo.tombstoneAndPurge(pA, ["m1"], "user request");
    expect(tombstoneIds).toHaveLength(1);
    expect(await repo.getById(pA, "m1")).toBeNull();
    expect(await repo.byIds(pA, ["m1"])).toEqual([]);
    expect(await repo.isTombstoned(pA, "m1")).toBe(true);
    expect(await repo.isTombstoned(pA, "other", "h-m1")).toBe(true); // by contentHash
    expect(await repo.isTombstoned(pB, "m1")).toBe(false); // tenant-injected
    const hits = await repo.vectorSearch(pA, { vector: await emb.embed("restart cache pool"), scopeIds: ["team:tA"], nowMs: NOW, limit: 10 });
    expect(hits).toEqual([]);
  });

  it("tombstone_blocks_reinsert_of_same_id_or_hash", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    await repo.tombstoneAndPurge(pA, ["m1"], "r");
    await expect(repo.insert(pA, await mem({ _id: "m1", claimKey: "x" }))).rejects.toThrow();
    await expect(repo.insert(pA, await mem({ _id: "m9", claimKey: "y", contentHash: "h-m1" }))).rejects.toThrow();
  });

  it("tombstoneAndPurge_leaves_unrelated_similar_memory", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    await repo.insert(pA, await mem({ _id: "m2", text: "checkout 5xx after deploy: restart cache pool please" }));
    await repo.tombstoneAndPurge(pA, ["m1"], "r");
    expect((await repo.getById(pA, "m2"))?.status).toBe("active");
  });

  it("expireDue_flips_status_at_boundary_only", async () => {
    await repo.insert(pA, await mem({ _id: "m1", expiresAtMs: NOW }));
    expect(await repo.expireDue(NOW - 1)).toEqual([]);
    expect((await repo.getById(pA, "m1"))?.status).toBe("active");
    expect(await repo.expireDue(NOW)).toEqual(["m1"]);
    expect((await repo.getById(pA, "m1"))?.status).toBe("expired");
  });

  it("replayTombstones_re_deletes_restored_docs", async () => {
    await repo.insert(pA, await mem({ _id: "m1" }));
    await repo.tombstoneAndPurge(pA, ["m1"], "r");
    repo.restoreForTest(await mem({ _id: "m1" })); // simulates backup restore bypassing guards
    expect(await repo.getById(pA, "m1")).not.toBeNull();
    expect(await repo.replayTombstones()).toBe(1);
    expect(await repo.getById(pA, "m1")).toBeNull();
  });
});

describe("FakeAuditStore", () => {
  it("records events and supports failure injection", async () => {
    const a = new FakeAuditStore();
    const e = { _id: "a1", traceId: "t", tenantId: "tA", actorId: "pA", purpose: "incident-triage", op: "recall" as const, decision: "allow" as const, reasonCodes: [], selectedIds: [], rejectedIds: [], queryHash: "q", createdAtMs: NOW };
    await a.record(e);
    expect(a.events).toHaveLength(1);
    a.setFailing(true);
    await expect(a.record(e)).rejects.toThrow();
    expect(a.events).toHaveLength(1);
  });
});

describe("FakeTraceStore", () => {
  const ev = (o: Partial<TraceEvent> & { _id: string }): TraceEvent => ({
    traceId: "t1", tenantId: "tA", principalId: "pA", step: "alert_received", payload: {}, createdAtMs: NOW, ...o,
  });

  it("trace_store_has_no_update_or_delete_method", () => {
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(new FakeTraceStore()));
    expect(names.filter((n) => /update|delete|remove|clear|set|put/i.test(n) && n !== "setFailing")).toEqual([]);
  });

  it("listByTrace_is_tenant_scoped_and_ordered", async () => {
    const t = new FakeTraceStore();
    await t.emit(ev({ _id: "e2", step: "recall_result", createdAtMs: NOW + 2 }));
    await t.emit(ev({ _id: "e1", createdAtMs: NOW + 1 }));
    await t.emit(ev({ _id: "x", tenantId: "tB" }));
    expect((await t.listByTrace(pA, "t1")).map((e) => e._id)).toEqual(["e1", "e2"]);
    expect(await t.listByTrace(pB, "t1")).toEqual([{ ...ev({ _id: "x", tenantId: "tB" }) }]);
  });

  it("emit_failure_injection_throws_without_storing", async () => {
    const t = new FakeTraceStore();
    t.setFailing(true);
    await expect(t.emit(ev({ _id: "e1" }))).rejects.toThrow();
    t.setFailing(false);
    expect(await t.listByTrace(pA, "t1")).toEqual([]);
  });

  it("feed_yields_only_own_tenant_events_since", async () => {
    const t = new FakeTraceStore();
    await t.emit(ev({ _id: "old", createdAtMs: NOW - 5 }));
    await t.emit(ev({ _id: "new", createdAtMs: NOW + 5 }));
    await t.emit(ev({ _id: "foreign", tenantId: "tB", createdAtMs: NOW + 5 }));
    const got: string[] = [];
    for await (const e of t.feed(pA, NOW)) got.push(e._id);
    expect(got).toEqual(["new"]);
  });
});

describe("FakeEvalStore", () => {
  it("saves and lists runs by scenario", async () => {
    const s = new FakeEvalStore();
    const run = { _id: "r1", scenarioId: "s1", arm: "R" as const, seed: 1, action: { tool: "investigate" as const, args: {}, usedMemoryIds: [] }, scores: { ok: true }, createdAtMs: NOW };
    await s.saveRun(run);
    await s.saveRun({ ...run, _id: "r2", scenarioId: "s2" });
    expect((await s.listRuns("s1")).map((r) => r._id)).toEqual(["r1"]);
  });
});
