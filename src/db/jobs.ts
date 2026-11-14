import type { Db } from "mongodb";
import type { Clock, MemoryRepo, MonitorAlert } from "../contracts/contracts.js";

// ---- Alert worker (plan 11.1). Alerts carry ids/reason codes only, never the canary or any text. ----
// Trace payload conventions the rules rely on (agree with Person B):
//   recall_result:   { decision, rejectedIds:[{id,reason}], latencyMs }
//   brain_decision:  { action, usedMemoryIds, latencyMs }
//   tool_validation: { result: "pass"|"reject", memoryValid: boolean, reason }
//   tool_executed:   { tool, ... }
const DENY_SPIKE_MIN_RECALLS = 5;
const DENY_SPIKE_RATE = 0.5;

export async function evaluateAlerts(db: Db, tenantId: string, sinceMs: number, opts: { canaries: string[] }): Promise<MonitorAlert[]> {
  const events = await db.collection("agent_traces").find({ tenantId, createdAtMs: { $gte: sinceMs } }).sort({ createdAtMs: 1, _id: 1 }).toArray();
  const auditRows = await db.collection("audit").find({ tenantId, createdAtMs: { $gte: sinceMs } }).toArray();
  const alerts: MonitorAlert[] = [];
  const push = (kind: MonitorAlert["kind"], traceId: string, detail: string, createdAtMs: number) =>
    alerts.push({ kind, traceId, tenantId, detail, createdAtMs });

  // 1. canary string in any trace or audit row
  const hasCanary = (doc: object) => { const { _id, ...rest } = doc as any; const s = JSON.stringify(rest); return opts.canaries.some((c) => s.includes(c)); };
  const canaryTraces = new Set<string>();
  if (opts.canaries.length) {
    for (const d of [...events, ...auditRows]) {
      if (hasCanary(d) && !canaryTraces.has(d.traceId)) {
        canaryTraces.add(d.traceId);
        push("canary_in_trace", d.traceId, "canary string found in stored row", d.createdAtMs);
      }
    }
  }

  const byTrace = new Map<string, any[]>();
  for (const e of events) byTrace.set(e.traceId, [...(byTrace.get(e.traceId) ?? []), e]);
  for (const [traceId, evs] of byTrace) {
    const executed = evs.find((e) => e.step === "tool_executed");
    // 2. an action ran although the memory recheck said the memory was no longer valid
    const stale = evs.find((e) => e.step === "tool_validation" && e.payload?.memoryValid === false);
    if (executed && stale) push("stale_memory_adopted", traceId, `reason=${stale.payload?.reason ?? "UNKNOWN"}`, executed.createdAtMs);
    // 3. the tool guard rejected a call
    const rejected = evs.find((e) => e.step === "tool_validation" && e.payload?.result === "reject");
    if (rejected) push("tool_guard_rejected", traceId, `reason=${rejected.payload?.reason ?? "UNKNOWN"}`, rejected.createdAtMs);
  }

  // 4. a principal's deny rate spikes
  const perPrincipal = new Map<string, { n: number; deny: number; last: any }>();
  for (const e of events) {
    if (e.step !== "recall_result") continue;
    const s = perPrincipal.get(e.principalId) ?? { n: 0, deny: 0, last: e };
    s.n++;
    if (e.payload?.decision === "deny") s.deny++;
    s.last = e;
    perPrincipal.set(e.principalId, s);
  }
  for (const [principalId, s] of perPrincipal) {
    if (s.n >= DENY_SPIKE_MIN_RECALLS && s.deny / s.n > DENY_SPIKE_RATE)
      push("deny_rate_spike", s.last.traceId, `principal=${principalId} denies=${s.deny}/${s.n}`, s.last.createdAtMs);
  }

  return alerts;
}

// ---- Expiry worker: flips status to "expired". The read-time gate never depends on it. ----
export function startExpiryWorker(repo: MemoryRepo, clock: Clock, everyMs = 10_000): { stop(): void } {
  const timer = setInterval(() => { repo.expireDue(clock.nowMs()).catch(() => {}); }, everyMs);
  return { stop: () => clearInterval(timer) };
}

// ---- Run after any restore/import so forgotten ids cannot reactivate (G14). ----
export async function runTombstoneReplay(repo: MemoryRepo): Promise<number> {
  return repo.replayTombstones();
}
