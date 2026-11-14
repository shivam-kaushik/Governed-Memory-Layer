import { describe, expect, it } from "vitest";
import { createLlmBrain } from "../../src/agent/llm-brain";
import type { Brain } from "../../src/contracts/contracts";
import { A_RESP, B_RESP, apiWorld } from "./helpers";

const json = <T>(r: { json: unknown }) => r.json as T;

describe("monitor api", () => {
  it("requires_a_session", async () => {
    const w = await apiWorld();
    for (const p of ["/api/monitor/events", "/api/monitor/metrics", "/api/monitor/alerts"]) expect((await w.call("GET", p)).status).toBe(401);
  });

  it("events_list_own_tenant_runs_in_order_and_filter_by_since", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const all = json<{ events: { step: string; createdAtMs: number }[] }>(await w.call("GET", "/api/monitor/events", A_RESP, undefined, { since: "0" })).events;
    expect(all.map((e) => e.step)).toEqual([
      "alert_received", "recall_requested", "recall_result", "brain_input", "brain_decision", "tool_validation", "tool_executed", "memory_written", "trace_closed",
    ]);
    const none = json<{ events: unknown[] }>(await w.call("GET", "/api/monitor/events", A_RESP, undefined, { since: String(w.clock.nowMs() + 1) }));
    expect(none.events).toEqual([]);
  });

  it("team_b_sees_no_team_a_events_metrics_or_alerts", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    expect(json<{ events: unknown[] }>(await w.call("GET", "/api/monitor/events", B_RESP, undefined, { since: "0" })).events).toEqual([]);
    expect(json<{ metrics: { recalls: number } }>(await w.call("GET", "/api/monitor/metrics", B_RESP)).metrics.recalls).toBe(0);
    expect(json<{ alerts: unknown[] }>(await w.call("GET", "/api/monitor/alerts", B_RESP)).alerts).toEqual([]);
    expect(json<{ metrics: { recalls: number } }>(await w.call("GET", "/api/monitor/metrics", A_RESP)).metrics.recalls).toBeGreaterThan(0);
  });

  it("forged_tenant_in_query_is_ignored", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const r = await w.call("GET", "/api/monitor/events", B_RESP, undefined, { since: "0", tenantId: "tenant-a" });
    expect(json<{ events: unknown[] }>(r).events).toEqual([]);
  });

  it("bad_since_is_400", async () => {
    const w = await apiWorld();
    expect((await w.call("GET", "/api/monitor/events", A_RESP, undefined, { since: "abc" })).status).toBe(400);
  });

  it("metrics_count_actions_and_abstain_rate", async () => {
    const w = await apiWorld("no_precedent");
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const m = json<{ metrics: { actionsByType: Record<string, number>; abstainRate: number } }>(await w.call("GET", "/api/monitor/metrics", A_RESP)).metrics;
    expect(m.actionsByType.investigate).toBe(1);
    expect(m.abstainRate).toBe(1);
  });

  it("tool_guard_rejection_raises_an_alert_with_ids_only", async () => {
    const w = await apiWorld("valid_fix");
    const bad: Brain = { decide: async () => ({ tool: "drop_database" as never, args: {}, usedMemoryIds: [] }) };
    await w.run(bad);
    const a = json<{ alerts: { kind: string; traceId: string; detail: string }[] }>(await w.call("GET", "/api/monitor/alerts", A_RESP)).alerts;
    expect(a.map((x) => x.kind)).toContain("tool_guard_rejected");
    expect(a[0]!.detail).toBe("TOOL_NOT_ALLOWED");
  });

  it("events_never_carry_memory_text", async () => {
    const w = await apiWorld("valid_fix");
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const body = JSON.stringify((await w.call("GET", "/api/monitor/events", A_RESP, undefined, { since: "0" })).json);
    expect(body).not.toContain("restart cache pool");
    expect(createLlmBrain).toBeTypeOf("function");
  });
});
