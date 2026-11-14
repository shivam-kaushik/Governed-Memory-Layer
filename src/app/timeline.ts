import type { TraceEvent } from "../contracts/contracts";

export interface Step {
  kind: "understood" | "recall" | "decision" | "guard" | "tool" | "memory" | "answer";
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad" | "info";
  ids?: string[];
  rejected?: { id: string; reason: string }[];
}

const p = (events: TraceEvent[], step: string) => events.find((e) => e.step === step)?.payload ?? {};
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

// Replays a recorded trace as operator-readable steps. Ids, hashes and reason codes only: no memory text.
export function buildSteps(events: TraceEvent[], rejected: { id: string; reason: string }[], inferred?: { service: boolean; version: boolean }): Step[] {
  const a = p(events, "alert_received");
  const r = p(events, "recall_result");
  const d = p(events, "brain_decision");
  const v = p(events, "tool_validation");
  const t = p(events, "tool_executed");
  const m = p(events, "memory_written");
  const selected = strs(r.selectedIds);
  const used = strs(d.usedMemoryIds);
  const reasons = strs(v.reasons);
  const guessed = [inferred?.service ? "service" : "", inferred?.version ? "version" : ""].filter(Boolean);
  const forgot = strs(m.forgotten);

  return [
    { kind: "understood", title: "Read your message", tone: "info", detail: `service ${String(a.service)}, version ${String(a.version)}, env ${String(a.environment)}${guessed.length ? ` (${guessed.join(" and ")} not stated: carried over or unknown)` : ""}` },
    { kind: "recall", title: "Searched governed memory", tone: selected.length ? "ok" : "warn", ids: selected, rejected, detail: selected.length ? `${selected.length} eligible, ${rejected.length} rejected` : `nothing eligible (${rejected.length} rejected)` },
    { kind: "decision", title: "Chose an action", tone: "info", ids: used, detail: `${String(d.tool)}${used.length ? ", relying on memory" : ", relying on no memory"} (${String((d.rationale as { rule?: string } | undefined)?.rule ?? "unspecified")})` },
    { kind: "guard", title: "Checked the action", tone: v.valid ? "ok" : "bad", detail: v.valid ? "allowed: tool on allowlist, memory ids present and still valid" : `blocked: ${reasons.join(", ") || "invalid"}` },
    { kind: "tool", title: "Ran the tool", tone: t.tool ? (t.fixed ? "ok" : "warn") : "bad", detail: t.tool ? `${String(t.tool)}: ${t.fixed ? "incident fixed" : "not fixed yet"}` : "not executed" },
    {
      kind: "memory",
      title: "Updated memory",
      tone: forgot.length ? "warn" : typeof m.memoryId === "string" ? "ok" : "info",
      ids: forgot.length ? forgot : typeof m.memoryId === "string" ? [m.memoryId] : [],
      detail: forgot.length ? "forgot memory that did not fix the incident" : typeof m.memoryId === "string" ? `saved a new ${String(m.status)} memory` : `no change (${String(m.reason ?? "none")})`,
    },
  ];
}

const LABEL = { small_talk: "small talk, no memory needed", memory_question: "a question about what memory holds", incident: "an incident to triage" } as const;

// Steps for a conversational reply (no triage run): what the agent understood, what it searched, how it answered.
export function chatSteps(o: { intent: keyof typeof LABEL; fields?: string; recall?: { selected: string[]; rejected: { id: string; reason: string }[] }; used: string[]; note?: string }): Step[] {
  const steps: Step[] = [{ kind: "understood", title: "Read your message", tone: "info", detail: `this is ${LABEL[o.intent]}${o.fields ? ` (${o.fields})` : ""}` }];
  if (o.recall) {
    const n = o.recall.selected.length;
    steps.push({ kind: "recall", title: "Searched governed memory", tone: n ? "ok" : "warn", ids: o.recall.selected, rejected: o.recall.rejected, detail: n ? `${n} eligible, ${o.recall.rejected.length} rejected` : `nothing eligible (${o.recall.rejected.length} rejected)` });
  }
  steps.push({ kind: "answer", title: "Replied", tone: "ok", ids: o.used, detail: o.note ?? (o.used.length ? "relying on memory" : "without using memory") });
  return steps;
}
