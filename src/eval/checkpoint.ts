import type { Action, Alert, EvidenceCard } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import { buildWorld, caller } from "./world";

// Frozen starting point for one seed: alert, principal, clock and the evidence real governed recall returns.
export interface Checkpoint {
  seed: number;
  nowMs: number;
  alert: Alert;
  nonce: string; // the true pool: appears only in the memory, never in the alert or prompt template
  otherPool: string; // the counterfactual value
  realCards: EvidenceCard[];
  realTruth: Action;
}

export async function buildCheckpoint(seed: number): Promise<Checkpoint> {
  const w = await buildWorld("valid_fix", seed);
  const s = w.scenario;
  const r = await w.layer.recall(
    { text: s.alert.text, service: s.alert.service, version: s.alert.version, environment: s.alert.environment },
    caller("tok-a-resp"),
  );
  if (r.decision !== "allow") throw new Error(`checkpoint ${seed}: recall was denied`);

  let i = 0;
  let otherPool: string;
  do otherPool = `cp-${sha256(`other|${seed}|${i++}`).slice(0, 6)}`;
  while (otherPool === s.nonce);

  return { seed, nowMs: s.nowMs, alert: s.alert, nonce: s.nonce, otherPool, realCards: r.cards, realTruth: s.truth };
}
