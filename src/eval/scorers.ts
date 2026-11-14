import type { Action } from "../contracts/contracts";

// Scorers never see the arm: only an opaque run id, the action, the truth for that run and the evidence ids (G20).
export interface ScorerInput {
  runId: string;
  action: Action;
  truth: Action;
  evidenceIds: string[];
}

export interface RunScore {
  runId: string;
  toolMatch: boolean;
  argMatch: boolean;
  memoryDriven: boolean; // cites at least one id, all of them present in the evidence
  success: boolean;
}

const canon = (args: Record<string, string | number>) => JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)));

export function scoreRun(x: ScorerInput): RunScore {
  const toolMatch = x.action.tool === x.truth.tool;
  const argMatch = canon(x.action.args) === canon(x.truth.args);
  const memoryDriven = x.action.usedMemoryIds.length > 0 && x.action.usedMemoryIds.every((id) => x.evidenceIds.includes(id));
  return { runId: x.runId, toolMatch, argMatch, memoryDriven, success: toolMatch && argMatch && memoryDriven };
}
