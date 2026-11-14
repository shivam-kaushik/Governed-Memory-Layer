import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDb, principalA, principalB, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoAuditStore } from "../../src/db/mongo-audit-store.js";
import { MongoTraceStore } from "../../src/db/mongo-trace-store.js";
import type { TraceEvent } from "../../src/contracts/contracts.js";

let t: TestDb;
let traces: MongoTraceStore;
let audit: MongoAuditStore;
const CANARY = "CANARY-9f2e1c";
const NOW = 1_000_000;

beforeAll(async () => {
  t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS });
  audit = new MongoAuditStore(t.db);
  traces = new MongoTraceStore(t.db, { nowMs: () => NOW }, { canaries: [CANARY] });
});
afterAll(async () => { await t.stop(); });
beforeEach(async () => { await t.db.collection("agent_traces").deleteMany({}); await t.db.collection("audit").deleteMany({}); });

const ev = (over: Partial<TraceEvent> = {}): TraceEvent => ({
  traceId: "tr1", tenantId: "tenantA", principalId: "alice", step: "alert_received",
  payload: {}, createdAtMs: NOW - 1000, ...over,
});

describe("A5 audit + traces", () => {
  it("audit_contains_no_raw_memory_text", async () => {
    await audit.record({
      traceId: "tr1", tenantId: "tenantA", actorId: "alice", purpose: "incident-triage", op: "recall",
      decision: "allow", reasonCodes: ["OK"], selectedIds: ["m1"], rejectedIds: [{ id: "m2", reason: "EXPIRED" }],
      queryHash: "abc", createdAtMs: NOW, text: "RAW MEMORY TEXT", value: { pool: "cp-1" },
    } as any);
    const row = await t.db.collection("audit").findOne({ traceId: "tr1" });
    expect(JSON.stringify(row)).not.toContain("RAW MEMORY TEXT");
    expect(row?.text).toBeUndefined();
    expect(row?.value).toBeUndefined();
    expect(row?.selectedIds).toEqual(["m1"]);
  });
  it("trace_store_has_no_update_or_delete_method", () => {
    const names = Object.getOwnPropertyNames(MongoTraceStore.prototype);
    expect(names.filter((n) => /^(update|delete|remove|set|replace|drop|clear)/i.test(n))).toEqual([]);
  });
  it("trace_rejects_raw_text_sized_payload_strings", async () => {
    await expect(traces.emit(ev({ payload: { note: "x".repeat(500) } }))).rejects.toThrow(/payload/i);
  });
  it("trace_ttl_index_exists_and_createdAt_is_real_time", async () => {
    const idx = (await t.db.collection("agent_traces").indexes()).find((i) => i.name === "trace_ttl_7d");
    expect(idx?.expireAfterSeconds).toBe(7 * 24 * 3600);
    await traces.emit(ev());
    const raw = await t.db.collection("agent_traces").findOne({});
    expect(raw?.createdAt).toBeInstanceOf(Date);
    expect((raw!.createdAt as Date).getTime()).toBeGreaterThan(NOW * 10); // real wall clock, not the tiny logical time
  });
  it("traces_are_tenant_scoped", async () => {
    await traces.emit(ev());
    expect(await traces.listByTrace(principalA, "tr1")).toHaveLength(1);
    expect(await traces.listByTrace(principalB, "tr1")).toEqual([]);
  });
  it("tenant_b_events_visible_only_to_tenant_b", async () => {
    await traces.emit(ev({ tenantId: "tenantB", traceId: "trB" }));
    expect(await traces.listByTrace(principalA, "trB")).toEqual([]);
    expect(await traces.listByTrace(principalB, "trB")).toHaveLength(1);
  });
  it("listByTrace_ordered_by_step", async () => {
    await traces.emit(ev({ step: "recall_requested", createdAtMs: 200 }));
    await traces.emit(ev({ step: "alert_received", createdAtMs: 100 }));
    await traces.emit(ev({ step: "brain_decision", createdAtMs: 300 }));
    await traces.emit(ev({ step: "tool_validation", createdAtMs: 300 }));
    expect((await traces.listByTrace(principalA, "tr1")).map((e) => e.step)).toEqual(["alert_received", "recall_requested", "brain_decision", "tool_validation"]);
  });

  function firstEvent(store: MongoTraceStore) {
    const it = store.feed(principalA, 0)[Symbol.asyncIterator]();
    const started = Promise.race([it.next(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("feed timeout")), 2000))]);
    return { it, started };
  }
  it("feed_delivers_new_event_within_2s", async () => {
    const { it, started } = firstEvent(traces);
    await new Promise((r) => setTimeout(r, 300));
    await traces.emit(ev({ traceId: "live1" }));
    expect((await started).value.traceId).toBe("live1");
    await it.return?.();
  });
  it("feed_polling_fallback_delivers_within_2s", async () => {
    const polling = new MongoTraceStore(t.db, { nowMs: () => NOW }, { forcePolling: true });
    const { it, started } = firstEvent(polling);
    await new Promise((r) => setTimeout(r, 300));
    await polling.emit(ev({ traceId: "live2" }));
    expect((await started).value.traceId).toBe("live2");
    await it.return?.();
  });
  it("feed_never_delivers_other_tenant_events", async () => {
    const polling = new MongoTraceStore(t.db, { nowMs: () => NOW }, { forcePolling: true });
    await polling.emit(ev({ tenantId: "tenantB", traceId: "foreign" }));
    await polling.emit(ev({ traceId: "mine" }));
    const it = polling.feed(principalA, 0)[Symbol.asyncIterator]();
    expect((await it.next()).value.traceId).toBe("mine");
    await it.return?.();
  });

  it("metrics_counts_and_p95_correct", async () => {
    for (let i = 1; i <= 10; i++) {
      await traces.emit(ev({ step: "recall_result", createdAtMs: NOW - 500,
        payload: { decision: i <= 2 ? "deny" : "allow", rejectedIds: i <= 4 ? [{ id: "m", reason: "EXPIRED" }] : [], latencyMs: i * 10 } }));
    }
    await traces.emit(ev({ step: "brain_decision", createdAtMs: NOW - 400, payload: { action: "investigate", latencyMs: 5 } }));
    await traces.emit(ev({ step: "brain_decision", createdAtMs: NOW - 400, payload: { action: "restart_cache_pool", latencyMs: 15 } }));
    await traces.emit(ev({ step: "brain_decision", createdAtMs: NOW - 400, payload: { action: "restart_cache_pool", latencyMs: 25 } }));
    await traces.emit(ev({ step: "recall_result", tenantId: "tenantB", createdAtMs: NOW - 500, payload: { decision: "deny", latencyMs: 9999 } }));
    await traces.emit(ev({ step: "recall_result", createdAtMs: NOW - 99_000, payload: { decision: "deny", latencyMs: 8888 } })); // outside window
    const m = await traces.metrics(principalA, 10_000);
    expect(m.recalls).toBe(10);
    expect(m.denies).toBe(2);
    expect(m.denyRate).toBeCloseTo(0.2);
    expect(m.rejectedPerRecall).toBeCloseTo(0.4);
    expect(m.actionsByType).toEqual({ investigate: 1, restart_cache_pool: 2 });
    expect(m.abstainRate).toBeCloseTo(1 / 3);
    expect(m.stepLatencyMs.recall_result).toEqual({ p50: 50, p95: 100 });
  });

  it("alert_raised_when_canary_in_trace", async () => {
    await traces.emit(ev({ traceId: "leaky", payload: { summary: `saw ${CANARY}` } }));
    await traces.emit(ev({ traceId: "clean" }));
    const canary = (await traces.alerts(principalA, 0)).filter((x) => x.kind === "canary_in_trace");
    expect(canary.map((x) => x.traceId)).toEqual(["leaky"]);
    expect(JSON.stringify(canary)).not.toContain(CANARY); // the alert must not itself leak the canary
  });
  it("alert_raised_when_canary_in_audit", async () => {
    await audit.record({ traceId: "aud1", tenantId: "tenantA", actorId: "alice", purpose: "p", op: "recall", decision: "allow",
      reasonCodes: [CANARY], selectedIds: [], rejectedIds: [], queryHash: "h", createdAtMs: NOW });
    expect((await traces.alerts(principalA, 0)).some((x) => x.kind === "canary_in_trace" && x.traceId === "aud1")).toBe(true);
  });
  it("alert_raised_on_expired_memory_adoption", async () => {
    await traces.emit(ev({ traceId: "bad", step: "tool_validation", createdAtMs: 10, payload: { result: "pass", memoryValid: false, reason: "EXPIRED" } }));
    await traces.emit(ev({ traceId: "bad", step: "tool_executed", createdAtMs: 20, payload: { tool: "restart_cache_pool" } }));
    await traces.emit(ev({ traceId: "fine", step: "tool_validation", createdAtMs: 10, payload: { result: "pass", memoryValid: true } }));
    await traces.emit(ev({ traceId: "fine", step: "tool_executed", createdAtMs: 20, payload: {} }));
    const stale = (await traces.alerts(principalA, 0)).filter((x) => x.kind === "stale_memory_adopted");
    expect(stale.map((x) => x.traceId)).toEqual(["bad"]);
  });
  it("alert_raised_when_tool_guard_rejects", async () => {
    await traces.emit(ev({ traceId: "g1", step: "tool_validation", payload: { result: "reject", reason: "TOOL_NOT_ALLOWED" } }));
    expect((await traces.alerts(principalA, 0)).some((x) => x.kind === "tool_guard_rejected" && x.traceId === "g1")).toBe(true);
  });
  it("alert_raised_on_deny_rate_spike", async () => {
    for (let i = 0; i < 6; i++) await traces.emit(ev({ traceId: `d${i}`, step: "recall_result", payload: { decision: i < 5 ? "deny" : "allow" } }));
    expect((await traces.alerts(principalA, 0)).some((x) => x.kind === "deny_rate_spike")).toBe(true);
  });
  it("alerts_are_tenant_scoped", async () => {
    await traces.emit(ev({ tenantId: "tenantB", traceId: "bleak", payload: { s: CANARY } }));
    expect(await traces.alerts(principalA, 0)).toEqual([]);
  });
});
