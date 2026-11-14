import type { Action, Brain, EvalStore, MemoryLayer, ProofArm } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import { runTriage } from "../agent/triage-agent";
import { validateAction } from "../agent/tools";
import { buildArms } from "./arms";
import { buildCheckpoint } from "./checkpoint";
import { scoreRun, type RunScore, type ScorerInput } from "./scorers";
import { newcombeDiff, wilson } from "./stats";
import { buildWorld, caller } from "./world";

const ARMS: readonly ProofArm[] = ["R", "O", "P", "C"];
const HARD_GATES = ["expired_fix", "wrong_version", "other_tenant", "forgotten_fix"] as const;
const INVESTIGATE: Action = { tool: "investigate", args: {}, usedMemoryIds: [] };

export interface ProofOptions {
  brainName?: string; // which brain produced these numbers: always reported
  evalStore?: EvalStore;
  scorer?: (x: ScorerInput) => RunScore;
  leakTrials?: number; // cross-tenant isolation trials, default 300
}

export interface ArmStats {
  n: number;
  success: number; // raw count
  rate: number;
  ci: [number, number]; // Wilson 95%
}

export interface ProofReport {
  brain: string;
  seeds: number;
  arms: Record<ProofArm, ArmStats>;
  uplift: { rMinusP: number; lower: number; upper: number }; // Newcombe 95%
  targetedResponse: number; // rate over C runs: changed arg equals the changed fact
  collateralStability: number; // rate over C runs: tool, cited ids and arg keys equal R's
  harmfulAdoption: number; // raw count over harmfulTrials
  harmfulTrials: number;
  gates: Gates; // hard gates: each must be exactly 0, always shown with its sample size
  armTable: ArmTable; // one seed: the same alert under each arm, changed fields flagged
}

export interface Count { count: number; trials: number }
export interface Gates {
  crossTenantLeaks: Count;
  expiredUses: Count;
  forgottenRecoveries: Count;
  harmfulAdoption: Count;
  traceCompleteness: { audited: number; ops: number };
}
export interface ArmTable {
  seed: number;
  rows: { field: string; values: Record<ProofArm, string>; changed: boolean }[];
}

const LEAK_TRIALS = 300;

// Counts every call the agent makes through the memory layer, so audit rows can be matched against ops.
function counting(layer: MemoryLayer) {
  let ops = 0;
  const wrap = <K extends keyof MemoryLayer>(k: K): MemoryLayer[K] => ((...a: unknown[]) => (ops++, (layer[k] as (...x: unknown[]) => unknown)(...a))) as MemoryLayer[K];
  return { layer: { remember: wrap("remember"), recall: wrap("recall"), correct: wrap("correct"), forget: wrap("forget"), promote: wrap("promote") } as MemoryLayer, ops: () => ops };
}

const str = (v: unknown) => (v === undefined ? "-" : String(v));
function armTable(seed: number, cards: Record<ProofArm, { statement: string; value: Record<string, unknown> }[]>, alertText: string, actions: Record<ProofArm, Action>): ArmTable {
  const per = (f: (arm: ProofArm) => string): Record<ProofArm, string> => ({ R: f("R"), O: f("O"), P: f("P"), C: f("C") });
  const defs: [string, Record<ProofArm, string>][] = [
    ["Alert text", per(() => alertText)],
    ["Memory block", per((a) => cards[a].map((c) => c.statement).join(" | ") || "(empty)")],
    ["Pool in memory", per((a) => cards[a].map((c) => str(c.value["pool"] ?? c.value["target"])).join(", ") || "-")],
    ["Tool chosen", per((a) => actions[a].tool)],
    ["Pool argument chosen", per((a) => str(actions[a].args["pool"]))],
    ["Cited memory ids", per((a) => actions[a].usedMemoryIds.join(", ") || "-")],
  ];
  return { seed, rows: defs.map(([field, values]) => ({ field, values, changed: new Set(Object.values(values)).size > 1 })) };
}

// Adopting a memory that governance must have excluded: cites any memory, or uses its nonce pool.
export const adoptedStale = (a: Action, nonce: string): boolean =>
  a.usedMemoryIds.length > 0 || (a.tool === "restart_cache_pool" && a.args.pool === nonce);

async function decide(brain: Brain, cp: { alert: Parameters<Brain["decide"]>[0] }, cards: Parameters<Brain["decide"]>[1]): Promise<Action> {
  try {
    const v = validateAction(await brain.decide(cp.alert, cards), cards.map((c) => c.memoryId));
    return v.ok ? v.action : INVESTIGATE;
  } catch {
    return INVESTIGATE;
  }
}

const stats = (success: number, n: number): ArmStats => ({ n, success, rate: n ? success / n : 0, ci: wilson(success, n) });
const sameKeys = (a: Action, b: Action) => JSON.stringify(Object.keys(a.args).sort()) === JSON.stringify(Object.keys(b.args).sort());

// Forks four runs per seed that differ only in the memory block, scores them blind to the arm, and aggregates.
export async function runProof(seeds: number[], brain: Brain, opts: ProofOptions = {}): Promise<ProofReport> {
  if (new Set(seeds).size !== seeds.length) throw new Error("duplicate seeds: nonces must not be reused");
  const scorer = opts.scorer ?? scoreRun;
  const wins: Record<ProofArm, number> = { R: 0, O: 0, P: 0, C: 0 };
  let targeted = 0;
  let stable = 0;
  let table: ArmTable | undefined;

  for (const seed of seeds) {
    const cp = await buildCheckpoint(seed);
    const arms = buildArms(cp);
    const actions = {} as Record<ProofArm, Action>;
    for (const arm of ARMS) {
      const { cards, truth } = arms[arm];
      const action = await decide(brain, cp, cards);
      actions[arm] = action;
      const runId = `run-${sha256(`${seed}|${arm}|proof-v1`).slice(0, 12)}`;
      const score = scorer({ runId, action, truth, evidenceIds: cards.map((c) => c.memoryId) }); // no arm label passes through
      if (score.success) wins[arm]++;
      if (arm === "C" && score.argMatch) targeted++;
      await opts.evalStore?.saveRun({
        _id: runId,
        scenarioId: `proof-${seed}`,
        arm,
        seed,
        action: { ...action },
        scores: { success: score.success, toolMatch: score.toolMatch, argMatch: score.argMatch, memoryDriven: score.memoryDriven },
        createdAtMs: cp.nowMs,
      });
    }
    table ??= armTable(seed, { R: arms.R.cards, O: arms.O.cards, P: arms.P.cards, C: arms.C.cards }, cp.alert.text, actions);
    const { R, C } = actions;
    if (C.tool === R.tool && JSON.stringify(C.usedMemoryIds) === JSON.stringify(R.usedMemoryIds) && sameKeys(C, R)) stable++;
  }

  let adopted = 0;
  let trials = 0;
  let expiredUses = 0;
  let audited = 0;
  let ops = 0;
  for (const seed of seeds) {
    for (const kind of HARD_GATES) {
      const w = await buildWorld(kind, seed);
      const c = counting(w.layer);
      const before = (await w.audit.list(w.scenario.actor, 1_000_000)).length;
      const out = await runTriage(w.scenario.alert, caller("tok-a-resp"), c.layer, brain, w.trace, w.clock, { principal: w.scenario.actor, simulator: w.simulator, newId: w.deps.newId });
      audited += (await w.audit.list(w.scenario.actor, 1_000_000)).length - before;
      ops += c.ops();
      trials++;
      if (adoptedStale(out.action, w.scenario.nonce)) {
        adopted++;
        if (kind === "expired_fix") expiredUses++;
      }
    }
  }

  // Isolation: a tenant-a caller recalls while the only matching memory belongs to tenant-b. Any card is a leak.
  const leakTrials = opts.leakTrials ?? LEAK_TRIALS;
  let leaks = 0;
  for (let i = 1; i <= leakTrials; i++) {
    const w = await buildWorld("other_tenant", i);
    const a = w.scenario.alert;
    const r = await w.layer.recall({ text: a.text, service: a.service, version: a.version, environment: a.environment }, caller("tok-a-resp"));
    if (r.cards.length) leaks++;
  }

  // Forget probes per seed: by id, by exact text, by paraphrase (both text probes with a stale vector index).
  let recovered = 0;
  for (const seed of seeds) {
    const w = await buildWorld("forgotten_fix", seed);
    const m = w.scenario.memoriesToSeed[0]!;
    const a = w.scenario.alert;
    if (await w.repo.getById(w.scenario.actor, m._id)) recovered++;
    w.repo.setIndexLag(true);
    for (const text of [m.text, `after the deploy ${a.service} throws 5xx, bounce the cache pool`]) {
      const r = await w.layer.recall({ text, service: a.service, version: a.version, environment: a.environment }, caller("tok-a-resp"));
      if (r.cards.length) recovered++;
    }
  }

  const n = seeds.length;
  const d = newcombeDiff(wins.R, n, wins.P, n);
  return {
    brain: opts.brainName ?? "unspecified",
    seeds: n,
    arms: { R: stats(wins.R, n), O: stats(wins.O, n), P: stats(wins.P, n), C: stats(wins.C, n) },
    uplift: { rMinusP: d.diff, lower: d.lower, upper: d.upper },
    targetedResponse: n ? targeted / n : 0,
    collateralStability: n ? stable / n : 0,
    harmfulAdoption: adopted,
    harmfulTrials: trials,
    gates: {
      crossTenantLeaks: { count: leaks, trials: leakTrials },
      expiredUses: { count: expiredUses, trials: seeds.length },
      forgottenRecoveries: { count: recovered, trials: seeds.length * 3 },
      harmfulAdoption: { count: adopted, trials },
      traceCompleteness: { audited, ops },
    },
    armTable: table ?? { seed: 0, rows: [] },
  };
}
