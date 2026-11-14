import type { Clock, Principal, TraceStore, TraceStep } from "../contracts/contracts";

// Trace writes never block the agent (G25): a failure only marks the trace incomplete.
// Tenant and principal come from the resolved Principal, never from the alert.
export function makeTracer(
  trace: TraceStore,
  clock: Clock,
  principal: Principal,
  newId: (prefix: string) => string,
  traceId: string,
) {
  let complete = true;
  return {
    get complete() {
      return complete;
    },
    async emit(step: TraceStep, payload: Record<string, unknown>): Promise<void> {
      try {
        await trace.emit({
          _id: newId("ev"),
          traceId,
          tenantId: principal.tenantId,
          principalId: principal.id,
          step,
          payload,
          createdAtMs: clock.nowMs(),
          ...(step === "trace_closed" ? { complete } : {}),
        });
      } catch {
        complete = false;
      }
    },
  };
}
