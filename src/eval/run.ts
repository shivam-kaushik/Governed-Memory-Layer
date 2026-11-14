import type { Action, Brain, EvalStore, ProofArm } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import { validateAction } from "../agent/tools";
import { buildArms } from "./arms";
import { buildCheckpoint } from "./checkpoint";
import { scoreRun, type RunScore, type ScorerInput } from "./scorers";
import { newcombeDiff, wilson } from "./stats";
import { buildWorld } from "./world";

const ARMS: readonly ProofArm[] = ["R", "O", "P", "C"];
const HARD_GATES = ["expired_fix", "wrong_version", "other_tenant", "forgotten_fix"] as const;
const INVESTIGATE: Action = { tool: "investigate", args: {}, usedMemoryIds: [] };

export interface ProofOptions {
  brainName?: string; // which brain produced these numbers: always reported
  evalStore?: EvalStore;
  scorer?: (x: ScorerInput) => RunScore;
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
    const { R, C } = actions;
    if (C.tool === R.tool && JSON.stringify(C.usedMemoryIds) === JSON.stringify(R.usedMemoryIds) && sameKeys(C, R)) stable++;
  }

  let adopted = 0;
  let trials = 0;
  for (const seed of seeds) {
    for (const kind of HARD_GATES) {
      const w = await buildWorld(kind, seed);
      trials++;
      if (adoptedStale((await w.run(brain)).action, w.scenario.nonce)) adopted++;
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
  };
}
