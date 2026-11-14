import type { TraceEvent } from "../contracts/contracts";

export interface Run {
  traceId: string;
  startMs: number;
  events: TraceEvent[];
  outcome?: string;
}

// Newest run first. Events keep arrival order inside a run (clock ticks can tie).
export function groupRuns(events: TraceEvent[]): Run[] {
  const by = new Map<string, Run>();
  for (const e of events) {
    const r = by.get(e.traceId) ?? { traceId: e.traceId, startMs: e.createdAtMs, events: [] };
    r.events.push(e);
    r.startMs = Math.min(r.startMs, e.createdAtMs);
    if (e.step === "trace_closed") r.outcome = String(e.payload["outcome"] ?? "");
    by.set(e.traceId, r);
  }
  return [...by.values()].sort((a, b) => a.startMs - b.startMs).reverse();
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Plain-words explanation built only from ids, counts and reason codes in the event.
export function explainStep(e: TraceEvent): string {
  const p = e.payload;
  switch (e.step) {
    case "alert_received":
      return `Alert received${p["service"] ? ` for ${String(p["service"])} ${String(p["version"] ?? "")}`.trimEnd() : ""}`;
    case "recall_requested":
      return "Recall requested";
    case "recall_result":
      return `Recall ${String(p["decision"])}: ${plural(ids(p["selectedIds"]).length, "memory").replace("memorys", "memories")} passed governance`;
    case "brain_input":
      return `Agent given ${plural(ids(p["evidenceIds"]).length, "memory").replace("memorys", "memories")} and ${plural(Number(p["noteCount"] ?? 0), "tool note")}`;
    case "brain_decision": {
      const used = ids(p["usedMemoryIds"]);
      return `Agent chose ${String(p["tool"])} ${used.length ? `using memory ${used.join(", ")}` : "with no memory"}`;
    }
    case "tool_validation":
      return p["valid"] === false ? `Guard BLOCKED: ${ids(p["reasons"]).join(", ")}` : "Guard passed";
    case "tool_executed":
      return `Executed ${String(p["tool"])}: ${p["fixed"] ? "incident fixed" : "not fixed"}`;
    case "memory_written":
      return p["skipped"] ? `No memory written (${String(p["reason"])})` : `Learned: wrote memory ${String(p["memoryId"])} (${String(p["status"])})`;
    case "trace_closed":
      return `Run closed: ${String(p["outcome"])}${e.complete === false ? " (trace incomplete)" : ""}`;
  }
}
