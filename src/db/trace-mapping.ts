import type { TraceEvent } from "../contracts/contracts.js";

export function toTraceEvent(d: any): TraceEvent {
  return {
    _id: String(d._id), traceId: d.traceId, tenantId: d.tenantId, principalId: d.principalId, step: d.step,
    payload: d.payload, createdAtMs: d.createdAtMs, ...(d.complete !== undefined ? { complete: d.complete } : {}),
  };
}
