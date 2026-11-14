import type { AgentBrain } from "../agent/brain-rules";
import type { Action, Alert, EvidenceCard, MemoryLayer, Principal, RecallQuery, RememberInput } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import type { PrincipalResolver } from "../core/deps";
import { resolvePrincipal } from "../core/identity";
import { validateAction } from "../agent/tools";
import { placebo } from "../eval/arms";
import { countTokens, renderMemoryBlock, renderPrompt } from "../eval/prompt";
import type { DashboardReads } from "./ports";

// Live experiments behind the "Judge Q&A" tab. Each runs real operations through the governed layer as fixed demo
// principals and reports what happened step by step. They create their own uniquely-named memories, so reruns are safe.
const DAY = 86_400_000;
const PURPOSE = "incident-triage";
const INVESTIGATE: Action = { tool: "investigate", args: {}, usedMemoryIds: [] };

export interface JudgeEnv {
  layer: MemoryLayer;
  reads: DashboardReads;
  resolver: PrincipalResolver;
  tokens: { eco: string; ecoReviewer: string; other: string }; // responder + reviewer of one team, responder of another client
  brain: AgentBrain;
  nonce: string; // unique per run: keeps demo memories and tombstones from colliding across reruns
  query: RecallQuery; // the alert every probe asks about
  now: () => number; // the injected clock
  wait: (ms: number) => Promise<void>; // injected so the harness itself never owns a timer
  trials?: number; // behavior experiment: independent decisions per arm (a model can vary run to run). Default 1.
}
export interface Step { label: string; detail: string; ok: boolean }
export interface Experiment { title: string; steps: Step[]; pass: boolean }

const caller = (sessionToken: string) => ({ sessionToken, purpose: PURPOSE });
const who = async (e: JudgeEnv, t: string): Promise<Principal> => {
  const p = await resolvePrincipal(e.resolver, t);
  if (!p) throw new Error("UNKNOWN_PRINCIPAL");
  return p;
};
const poolFor = (e: JudgeEnv, tag: string) => `cp-${sha256(`${e.nonce}|${tag}`).slice(0, 6)}`;
const ids = (cards: EvidenceCard[]) => cards.map((c) => c.memoryId);
const finish = (title: string, steps: Step[]): Experiment => ({ title, steps, pass: steps.every((s) => s.ok) });
// Demo hygiene: forget the memories an experiment made so they never compete with the seeded ones. Failures are ignored.
const tidy = async (e: JudgeEnv, token: string, ...ids: string[]) => {
  for (const id of ids) await e.layer.forget(id, "demo cleanup", caller(token)).catch(() => undefined);
};
const codeOf = (x: unknown) => (x instanceof Error ? x.message : "ERROR");

function fix(e: JudgeEnv, tag: string, pool: string, service = e.query.service): RememberInput {
  return {
    memoryType: "fix",
    claimKey: `${service}/5xx/cache/${tag}-${e.nonce}`,
    text: `charging sessions fail with 5xx on ${service}: restart cache pool ${pool}`,
    value: { action: "restart_cache_pool", pool },
    appliesTo: { service, versionRange: ">=1.0.0", environment: e.query.environment },
    scope: "team",
    ttlMs: 7 * DAY,
    confidence: 0.9,
    source: { type: "demo", ref: `judge-${e.nonce}` },
  };
}
const recall = (e: JudgeEnv, token: string, over: Partial<RecallQuery> = {}) => e.layer.recall({ ...e.query, ...over }, caller(token));
// The vector index is eventually consistent: a memory written a moment ago can take a second to become searchable.
// Only used to wait for a just-written memory to appear; absence checks never retry.
async function recallUntil(e: JudgeEnv, token: string, id: string, over: Partial<RecallQuery> = {}) {
  let r = await recall(e, token, over);
  for (let i = 0; i < 24 && !ids(r.cards).includes(id); i++) {
    await e.wait(500);
    r = await recall(e, token, over);
  }
  return r;
}

// Q1. One team's or client's memory must not reach another.
export async function isolationExperiment(e: JudgeEnv): Promise<Experiment> {
  const steps: Step[] = [];
  const poolA = poolFor(e, "iso-a");
  const a = await e.layer.remember(fix(e, "iso", poolA), caller(e.tokens.ecoReviewer));
  const priv = await e.layer.remember(
    { ...fix(e, "iso-priv", poolFor(e, "iso-p")), memoryType: "preference", scope: "private", claimKey: `pref/escalate-${e.nonce}`, text: `prefers to page the charger-ops oncall first (${e.nonce})`, value: { escalate: "charger-ops" }, appliesTo: { service: e.query.service, versionRange: "*", environment: e.query.environment } },
    caller(e.tokens.eco),
  );
  const leaks = (cards: EvidenceCard[]) => cards.filter((c) => c.memoryId === a.id || c.memoryId === priv.id || c.statement.includes(poolA)).length;

  const own = await recallUntil(e, e.tokens.eco, a.id);
  steps.push({ label: "Control: the owning team recalls its own fix", detail: `returned ${ids(own.cards).length} card(s), includes the new team fix: ${ids(own.cards).includes(a.id)}`, ok: ids(own.cards).includes(a.id) });

  const other = await recall(e, e.tokens.other);
  steps.push({ label: "Another client asks the same alert", detail: `returned ${ids(other.cards).length} card(s) of its own; ${leaks(other.cards)} from the other team`, ok: leaks(other.cards) === 0 });

  const exact = await recall(e, e.tokens.other, { text: fix(e, "iso", poolA).text });
  steps.push({ label: "Another client asks using the other team's exact memory text", detail: `${leaks(exact.cards)} leaked card(s)`, ok: leaks(exact.cards) === 0 });

  const rev = await recall(e, e.tokens.ecoReviewer);
  steps.push({ label: "Same-team reviewer asks: private notes of a colleague stay hidden", detail: `sees team fix: ${ids(rev.cards).includes(a.id)}; sees colleague's private note: ${ids(rev.cards).includes(priv.id)}`, ok: ids(rev.cards).includes(a.id) && !ids(rev.cards).includes(priv.id) });

  for (const [label, run] of [
    ["Another client tries to forget by id", () => e.layer.forget(a.id, "probe", caller(e.tokens.other))],
    ["Another client tries to correct by id", () => e.layer.correct(a.id, { text: "tampered", reason: "probe" }, caller(e.tokens.other))],
  ] as const) {
    let denied = "";
    try {
      await run();
    } catch (x) {
      denied = codeOf(x);
    }
    steps.push({ label, detail: denied ? `denied: ${denied}` : "NOT DENIED", ok: denied !== "" });
  }
  const after = await recall(e, e.tokens.eco);
  steps.push({ label: "After the attacks the memory is untouched", detail: `still recalled by its owner: ${ids(after.cards).includes(a.id)}`, ok: ids(after.cards).includes(a.id) });
  await tidy(e, e.tokens.ecoReviewer, a.id);
  await tidy(e, e.tokens.eco, priv.id);
  return finish("Isolation across clients and scopes", steps);
}

// Q2a. Expiry: start a short-lived memory, check it later. The UI waits between the two calls.
export async function expiryStart(e: JudgeEnv, ttlMs: number): Promise<{ id: string; expiresAtMs: number; eligibleNow: boolean }> {
  const m = await e.layer.remember({ ...fix(e, "ttl", poolFor(e, "ttl")), ttlMs }, caller(e.tokens.ecoReviewer));
  const p = await who(e, e.tokens.eco);
  const row = (await e.reads.listMemories(p, p.scopes)).find((x) => x._id === m.id);
  const r = await recallUntil(e, e.tokens.eco, m.id);
  return { id: m.id, expiresAtMs: row?.expiresAtMs ?? 0, eligibleNow: ids(r.cards).includes(m.id) };
}
export async function expiryCheck(e: JudgeEnv, id: string): Promise<{ eligible: boolean; reason?: string; expiresAtMs: number; nowMs: number }> {
  const p = await who(e, e.tokens.eco);
  const r = await recall(e, e.tokens.eco);
  const row = (await e.reads.listMemories(p, p.scopes)).find((x) => x._id === id);
  const nowMs = e.now();
  if (ids(r.cards).includes(id)) return { eligible: true, expiresAtMs: row?.expiresAtMs ?? 0, nowMs };
  const audited = (await e.reads.listAudit(p, 50)).flatMap((a) => a.rejectedIds).find((x) => x.id === id)?.reason;
  // Expiry is filtered before ranking, so the memory may never reach the audit as a candidate: derive the reason from the row itself.
  const reason = audited ?? (row && row.expiresAtMs <= nowMs ? "EXPIRED" : "NOT_ELIGIBLE");
  return { eligible: false, reason, expiresAtMs: row?.expiresAtMs ?? 0, nowMs };
}

// Q2b. A wrong memory is corrected: a new version supersedes it and only the new one is recalled.
export async function correctExperiment(e: JudgeEnv): Promise<Experiment> {
  const steps: Step[] = [];
  const bad = poolFor(e, "bad");
  const good = poolFor(e, "good");
  const m = await e.layer.remember(fix(e, "corr", bad), caller(e.tokens.ecoReviewer));
  const before = await recallUntil(e, e.tokens.eco, m.id);
  steps.push({ label: "A fix is stored, then turns out to name the wrong pool", detail: `recall returns pool ${String(before.cards.find((c) => c.memoryId === m.id)?.value["pool"])}`, ok: ids(before.cards).includes(m.id) });

  const c = await e.layer.correct(m.id, { text: fix(e, "corr", good).text, value: { action: "restart_cache_pool", pool: good }, reason: "pool was rotated" }, caller(e.tokens.ecoReviewer));
  const after = await recallUntil(e, e.tokens.eco, c.newId);
  const card = after.cards.find((x) => x.memoryId === c.newId);
  steps.push({ label: "Correct creates a new version", detail: `new id supersedes the old; version ${card?.version ?? "?"}, pool ${String(card?.value["pool"])}`, ok: !!card && card.version >= 2 && card.value["pool"] === good });
  steps.push({ label: "The old version is no longer recalled", detail: `old id present in recall: ${ids(after.cards).includes(m.id)}`, ok: !ids(after.cards).includes(m.id) });

  const p = await who(e, e.tokens.eco);
  const old = (await e.reads.listMemories(p, p.scopes)).find((x) => x._id === m.id);
  steps.push({ label: "The old version is kept for the audit trail as superseded", detail: `status: ${old?.status ?? "missing"}`, ok: old?.status === "superseded" });
  await tidy(e, e.tokens.ecoReviewer, c.newId);
  return finish("Correcting a wrong memory", steps);
}

// Q2c. Forget: tombstone first, cascade to derived memories, probes by id, text and paraphrase all come back empty.
export async function forgetExperiment(e: JudgeEnv): Promise<Experiment> {
  const steps: Step[] = [];
  const pool = poolFor(e, "forget");
  const rev = caller(e.tokens.ecoReviewer);
  const root = await e.layer.remember(fix(e, "forget", pool), rev);
  const derived = await e.layer.remember(
    { ...fix(e, "derived", pool), memoryType: "fact", claimKey: `runbook/${e.nonce}`, text: `runbook note built from the fix for pool ${pool}`, value: { note: "derived" }, derivedFrom: [root.id] },
    rev,
  );
  const similar = await e.layer.remember(fix(e, "similar", poolFor(e, "similar"), "billing-service"), rev);
  const before = await recallUntil(e, e.tokens.eco, root.id);
  steps.push({ label: "Before: the fix is recalled", detail: `recalled: ${ids(before.cards).includes(root.id)}`, ok: ids(before.cards).includes(root.id) });

  const f = await e.layer.forget(root.id, "demo: memory proved wrong", rev);
  steps.push({ label: "Forget one id", detail: `tombstone ${f.tombstoneId}; cascaded to ${f.cascadedIds.length} derived memor${f.cascadedIds.length === 1 ? "y" : "ies"}`, ok: f.cascadedIds.includes(derived.id) });

  const p = await who(e, e.tokens.eco);
  const rows = (await e.reads.listMemories(p, p.scopes)).map((x) => x._id);
  steps.push({ label: "Probe by id", detail: `fix present: ${rows.includes(root.id)}, derived present: ${rows.includes(derived.id)}`, ok: !rows.includes(root.id) && !rows.includes(derived.id) });
  const exact = await recall(e, e.tokens.eco, { text: fix(e, "forget", pool).text });
  steps.push({ label: "Probe by exact text", detail: `${exact.cards.filter((c) => c.memoryId === root.id || c.memoryId === derived.id).length} card(s) returned`, ok: !ids(exact.cards).includes(root.id) && !ids(exact.cards).includes(derived.id) });
  const para = await recall(e, e.tokens.eco, { text: "after the deploy the session service throws 5xx, bounce the cache pool" });
  steps.push({ label: "Probe by paraphrase", detail: `${para.cards.filter((c) => c.memoryId === root.id || c.memoryId === derived.id).length} card(s) returned`, ok: !ids(para.cards).includes(root.id) && !ids(para.cards).includes(derived.id) });

  const sim = await recall(e, e.tokens.eco, { service: "billing-service", text: fix(e, "similar", poolFor(e, "similar"), "billing-service").text });
  steps.push({ label: "Unrelated similar memory (other service) survives", detail: `still recalled: ${ids(sim.cards).includes(similar.id)}`, ok: ids(sim.cards).includes(similar.id) });
  await tidy(e, e.tokens.ecoReviewer, similar.id);
  return finish("Forgetting a memory", steps);
}

// Q3. Same alert, same prompt, four memory blocks: only the real and counterfactual blocks may move the decision.
export interface ArmRun {
  arm: "R" | "O" | "P" | "C";
  label: string;
  action: Action; // first run, shown in full
  why?: string; // the brain's own explanation for the first run, when it gives one
  runs: number;
  restartedTruePool: number; // runs that restarted the pool the real memory names
  restartedOtherPool: number; // runs that restarted the counterfactual pool
  investigated: number;
  memory: string;
  memoryTokens: number;
  promptTokens: number;
}
export interface BehaviorResult { arms: ArmRun[]; truePool: string; otherPool: string; pass: boolean; note: string }

// Identical in every arm. It confirms the symptom but never names the pool, so the pool can only come from memory.
const FINDING = "Logs: connection timeouts between session-service and its cache tier after the deploy.";

export async function behaviorExperiment(e: JudgeEnv): Promise<BehaviorResult> {
  const alert: Alert = { id: `judge-${e.nonce}`, service: e.query.service, version: e.query.version, environment: e.query.environment, symptom: e.query.text, text: e.query.text };
  // The memory block is the recalled fix only: the experiment varies one fact, so unrelated notes (e.g. a preference) stay out of every arm.
  const real = (await recall(e, e.tokens.eco)).cards.filter((c) => c.value["action"] === "restart_cache_pool").slice(0, 1);
  const truePool = String(real[0]?.value["pool"] ?? "");
  if (!real.length) return { arms: [], truePool: "", otherPool: "", pass: false, note: "No eligible memory for this alert: nothing to compare." };
  const otherPool = `cp-${sha256(`other|${truePool}`).slice(0, 6)}`;
  const swapped: EvidenceCard[] = JSON.parse(JSON.stringify(real).split(truePool).join(otherPool));
  const blocks: [ArmRun["arm"], string, EvidenceCard[]][] = [
    ["R", "Real memory", real],
    ["O", "No memory", []],
    ["P", "Placebo (same length, irrelevant text)", real.map((c) => placebo(c, e.nonce.length + real.length))],
    ["C", "Counterfactual (pool changed in memory only)", swapped],
  ];
  const trials = Math.max(1, e.trials ?? 1);
  const decide = async (cards: EvidenceCard[]): Promise<{ action: Action; why?: string }> => {
    try {
      let raw: unknown;
      let why: string | undefined;
      if (e.brain.decideWithRationale) {
        const out = await e.brain.decideWithRationale(alert, cards, [FINDING]);
        raw = out.action;
        why = out.rationale.explanation;
      } else raw = await e.brain.decide(alert, cards);
      const v = validateAction(raw, cards.map((c) => c.memoryId));
      return { action: v.ok ? v.action : INVESTIGATE, ...(why ? { why } : {}) };
    } catch (x) {
      return { action: INVESTIGATE, why: `brain error (${codeOf(x)}): fell back to investigate` };
    }
  };
  const arms: ArmRun[] = await Promise.all(
    blocks.map(async ([arm, label, cards]) => {
      const runs = await Promise.all(Array.from({ length: trials }, () => decide(cards)));
      const pool = (r: { action: Action }) => (r.action.tool === "restart_cache_pool" ? r.action.args["pool"] : undefined);
      const first = runs[0]!;
      return {
        arm,
        label,
        action: first.action,
        ...(first.why ? { why: first.why } : {}),
        runs: trials,
        restartedTruePool: runs.filter((r) => pool(r) === truePool).length,
        restartedOtherPool: runs.filter((r) => pool(r) === otherPool).length,
        investigated: runs.filter((r) => r.action.tool === "investigate").length,
        memory: cards.map((c) => c.statement).join(" | ") || "(empty)",
        memoryTokens: countTokens(renderMemoryBlock(cards)),
        promptTokens: countTokens(renderPrompt(alert, cards)),
      };
    }),
  );
  const [R, O, P, C] = arms as [ArmRun, ArmRun, ArmRun, ArmRun];
  const lenOk = R.memoryTokens > 0 && Math.abs(P.memoryTokens - R.memoryTokens) / R.memoryTokens <= 0.02;
  // Plain comparisons, no tuned threshold: real memory beats no/placebo memory at reaching the true pool,
  // and the counterfactual beats both at reaching the changed pool.
  const pass = R.restartedTruePool > O.restartedTruePool && R.restartedTruePool > P.restartedTruePool && C.restartedOtherPool > R.restartedOtherPool && C.restartedOtherPool > P.restartedOtherPool && lenOk;
  return { arms, truePool, otherPool, pass, note: `${trials === 1 ? "One decision per arm: an illustration." : `${trials} independent decisions per arm: read the counts, not a percentage.`} Every arm gets the same alert and the same log line ("${FINDING}"), which never names the pool; only the memory block differs. The Proof tab holds the multi-seed statistics (rule brain).` };
}
