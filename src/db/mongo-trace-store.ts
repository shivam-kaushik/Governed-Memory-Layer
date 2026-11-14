import type { Db } from "mongodb";
import type { Clock, MonitorAlert, MonitorMetrics, Principal, TraceEvent, TraceStore } from "../contracts/contracts.js";
import { systemClock } from "./system-clock.js";
import { traceFeed } from "./feed.js";
import { computeMetrics } from "./metrics.js";
import { evaluateAlerts } from "./jobs.js";
import { toTraceEvent } from "./trace-mapping.js";

const MAX_PAYLOAD_STRING = 256; // ids, hashes, reason codes and short summaries only (G23)

function assertNoRawText(v: unknown): void {
  if (typeof v === "string") { if (v.length > MAX_PAYLOAD_STRING) throw new Error("trace payload string too long: raw text is not allowed"); }
  else if (Array.isArray(v)) v.forEach(assertNoRawText);
  else if (v && typeof v === "object") Object.values(v).forEach(assertNoRawText);
}

// Append-only by construction: no update/delete/replace method exists on this class (G23).
export class MongoTraceStore implements TraceStore {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = systemClock,
    private readonly opts: { canaries?: string[]; forcePolling?: boolean } = {},
  ) {}

  async emit(e: TraceEvent): Promise<void> {
    assertNoRawText(e.payload);
    await this.db.collection("agent_traces").insertOne({
      traceId: e.traceId, tenantId: e.tenantId, principalId: e.principalId, step: e.step,
      payload: e.payload, createdAtMs: e.createdAtMs,
      ...(e.complete !== undefined ? { complete: e.complete } : {}),
      createdAt: new Date(systemClock.nowMs()), // real wall-clock; drives the 7-day TTL cleanup only
    });
  }

  async listByTrace(p: Principal, traceId: string): Promise<TraceEvent[]> {
    const rows = await this.db.collection("agent_traces").find({ tenantId: p.tenantId, traceId }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    return rows.map(toTraceEvent);
  }

  feed(p: Principal, sinceMs: number): AsyncIterable<TraceEvent> {
    return traceFeed(this.db, p.tenantId, sinceMs, { forcePolling: this.opts.forcePolling });
  }

  metrics(p: Principal, windowMs: number): Promise<MonitorMetrics> {
    return computeMetrics(this.db, p.tenantId, this.clock.nowMs(), windowMs);
  }

  alerts(p: Principal, sinceMs: number): Promise<MonitorAlert[]> {
    return evaluateAlerts(this.db, p.tenantId, sinceMs, { canaries: this.opts.canaries ?? [] });
  }
}
