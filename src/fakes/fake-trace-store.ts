import type { MonitorAlert, MonitorMetrics, Principal, TraceEvent, TraceStore } from "../contracts/contracts";

// Append-only: no update/delete methods by design.
export class FakeTraceStore implements TraceStore {
  private events: TraceEvent[] = [];
  private failing = false;

  setFailing(on: boolean): void {
    this.failing = on;
  }

  async emit(e: TraceEvent): Promise<void> {
    if (this.failing) throw new Error("trace write failed");
    this.events.push(structuredClone(e));
  }

  async listByTrace(p: Principal, traceId: string): Promise<TraceEvent[]> {
    return this.events
      .filter((e) => e.tenantId === p.tenantId && e.traceId === traceId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .map((e) => structuredClone(e));
  }

  async *feed(p: Principal, sinceMs: number): AsyncIterable<TraceEvent> {
    for (const e of this.events) {
      if (e.tenantId === p.tenantId && e.createdAtMs >= sinceMs) yield structuredClone(e);
    }
  }

  // shortcut: ignores windowMs and latency percentiles; B7 replaces with real aggregation tests.
  async metrics(p: Principal, windowMs: number): Promise<MonitorMetrics> {
    const mine = this.events.filter((e) => e.tenantId === p.tenantId);
    const recallEvents = mine.filter((e) => e.step === "recall_result");
    const denies = recallEvents.filter((e) => e.payload.decision === "deny").length;
    const actionsByType: Record<string, number> = {};
    for (const e of mine.filter((e) => e.step === "brain_decision")) {
      const t = String(e.payload.tool ?? "unknown");
      actionsByType[t] = (actionsByType[t] ?? 0) + 1;
    }
    const total = Object.values(actionsByType).reduce((s, n) => s + n, 0);
    return {
      windowMs,
      recalls: recallEvents.length,
      denies,
      denyRate: recallEvents.length ? denies / recallEvents.length : 0,
      rejectedPerRecall: 0,
      actionsByType,
      abstainRate: total ? (actionsByType.investigate ?? 0) / total : 0,
      stepLatencyMs: {},
    };
  }

  // shortcut: only guard rejections are detected (ids and reason codes alone cannot show adoption of bad memory); alert worker is a cut-list item.
  async alerts(p: Principal, sinceMs: number): Promise<MonitorAlert[]> {
    return this.events
      .filter((e) => e.tenantId === p.tenantId && e.createdAtMs >= sinceMs && e.step === "tool_validation" && e.payload.valid === false)
      .map((e) => ({
        kind: "tool_guard_rejected" as const,
        traceId: e.traceId,
        tenantId: e.tenantId,
        createdAtMs: e.createdAtMs,
        detail: Array.isArray(e.payload.reasons) ? e.payload.reasons.map(String).join(",") : "",
      }))
      .reverse();
  }
}
