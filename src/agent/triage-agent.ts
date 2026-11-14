import type { Action, Alert, Caller, Clock, EvidenceCard, MemoryLayer, Principal, RecallQuery, TraceStore } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import type { AgentBrain, Rationale } from "./brain-rules";
import { makeTracer } from "./trace";
import { validateAction, type GuardReason, type ToolResult, type ToolSimulator } from "./tools";

const DAY = 86_400_000;
const INVESTIGATE: Action = { tool: "investigate", args: {}, usedMemoryIds: [] };

// plan.md signature plus ctx: the resolved principal (trace tenancy), the tool simulator and an id source.
export interface TriageContext {
  principal: Principal;
  simulator: ToolSimulator;
  newId: (prefix: string) => string;
  notes?: string[]; // tool findings from earlier turns of this incident (data, not instructions)
}
export interface TriageOutcome {
  action: Action;
  result: ToolResult;
  traceId: string;
  traceComplete: boolean;
  explanation?: string; // model's own words, returned to the operator only
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Loop: recall, brain, validate (intent traced first), execute, remember a verified outcome.
export async function runTriage(
  alert: Alert,
  caller: Caller,
  layer: MemoryLayer,
  brain: AgentBrain,
  trace: TraceStore,
  clock: Clock,
  ctx: TriageContext,
): Promise<TriageOutcome> {
  const traceId = ctx.newId("trace");
  const t = makeTracer(trace, clock, ctx.principal, ctx.newId, traceId);

  await t.emit("alert_received", {
    alertId: alert.id,
    service: alert.service,
    version: alert.version,
    environment: alert.environment,
    alertHash: sha256(alert.text),
  });

  const query: RecallQuery = { text: alert.text, service: alert.service, version: alert.version, environment: alert.environment };
  await t.emit("recall_requested", { queryHash: sha256(JSON.stringify(query)) });
  let cards: EvidenceCard[] = [];
  try {
    const r = await layer.recall(query, caller);
    cards = r.cards;
    await t.emit("recall_result", { decision: r.decision, recallTraceId: r.traceId, selectedIds: cards.map((c) => c.memoryId) });
  } catch {
    // Governance layer unavailable: act on no evidence rather than on unverified evidence.
    await t.emit("recall_result", { decision: "error", selectedIds: [] });
  }
  const evidenceIds = cards.map((c) => c.memoryId);
  await t.emit("brain_input", { evidenceIds, noteCount: ctx.notes?.length ?? 0 });

  let raw: unknown;
  let rationale: Rationale;
  try {
    if (brain.decideWithRationale) {
      const out = await brain.decideWithRationale(alert, cards, ctx.notes ?? []);
      raw = out.action;
      rationale = out.rationale;
    } else {
      raw = await brain.decide(alert, cards);
      rationale = { rule: "unspecified", evidenceIds: [] };
    }
  } catch {
    raw = INVESTIGATE;
    rationale = { rule: "brain_error", evidenceIds: [] };
  }
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const argsObj = o.args && typeof o.args === "object" ? (o.args as Record<string, unknown>) : {};
  await t.emit("brain_decision", {
    tool: typeof o.tool === "string" ? o.tool.slice(0, 64) : "invalid",
    argKeys: Object.keys(argsObj).sort(),
    argsHash: sha256(JSON.stringify(o.args ?? null)),
    usedMemoryIds: Array.isArray(o.usedMemoryIds) ? o.usedMemoryIds.filter((x): x is string => typeof x === "string") : [],
    rationale: { rule: rationale.rule, evidenceIds: rationale.evidenceIds },
    ...(rationale.explanation ? { explanationHash: sha256(rationale.explanation) } : {}),
  });

  // Intent is traced before anything executes (G24). Validation never trusts memory content.
  const v = validateAction(raw, evidenceIds);
  let reason: GuardReason | null = v.ok ? null : v.reason;
  if (v.ok && v.action.usedMemoryIds.length && !(await stillValid(layer, query, caller, v.action.usedMemoryIds))) {
    reason = "MEMORY_INVALID";
  }
  await t.emit("tool_validation", { valid: reason === null, reasons: reason ? [reason] : [] });

  const action: Action = v.action ?? INVESTIGATE;
  let result: ToolResult;
  if (reason === null) {
    result = ctx.simulator.run(action);
    await t.emit("tool_executed", { tool: action.tool, fixed: result.fixed });
  } else {
    result = { executed: false, fixed: false, rejected: reason };
  }

  await t.emit("memory_written", await writeOutcome(layer, caller, alert, action, result));
  await t.emit("trace_closed", { outcome: result.rejected ?? (result.fixed ? "fixed" : "executed") });
  return { action, result, traceId, traceComplete: t.complete, ...(rationale.explanation ? { explanation: rationale.explanation.slice(0, 600) } : {}) };
}

// G6 at execution time: every memory the action relies on must still be recallable right now.
async function stillValid(layer: MemoryLayer, query: RecallQuery, caller: Caller, used: string[]): Promise<boolean> {
  try {
    const ids = new Set((await layer.recall(query, caller)).cards.map((c) => c.memoryId));
    return used.every((id) => ids.has(id));
  } catch {
    return false;
  }
}

// Only a verified fix that did not come from memory is new knowledge worth remembering.
async function writeOutcome(layer: MemoryLayer, caller: Caller, alert: Alert, action: Action, result: ToolResult): Promise<Record<string, unknown>> {
  if (!result.executed) return { skipped: true, reason: "NOT_EXECUTED" };
  if (!result.fixed || action.tool !== "restart_cache_pool") return { skipped: true, reason: "NOT_FIXED" };
  if (action.usedMemoryIds.length) return { skipped: true, reason: "ALREADY_KNOWN" };
  const pool = String(action.args.pool);
  try {
    const w = await layer.remember(
      {
        memoryType: "fix",
        claimKey: `${alert.service}/${slug(alert.symptom)}/restart_cache_pool`,
        text: `${alert.service} ${alert.symptom}: restart cache pool ${pool}`,
        value: { action: "restart_cache_pool", pool },
        appliesTo: { service: alert.service, versionRange: alert.version, environment: alert.environment },
        scope: "private",
        ttlMs: 7 * DAY,
        confidence: 0.7,
        source: { type: "agent_outcome", ref: alert.id },
      },
      caller,
    );
    return { memoryId: w.id, status: w.status, writeTraceId: w.traceId };
  } catch (e) {
    return { skipped: true, reason: typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "WRITE_FAILED" };
  }
}
