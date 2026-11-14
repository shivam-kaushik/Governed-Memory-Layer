import type { Action, EvidenceCard, ProofArm } from "../contracts/contracts";
import { sha256 } from "../core/audit";
import type { Checkpoint } from "./checkpoint";
import { countTokens } from "./prompt";

export interface ArmSpec {
  cards: EvidenceCard[]; // the memory block: the only thing that differs between arms
  truth: Action; // ground truth for this arm's run
}

// Irrelevant filler about a different subject. Contains no pool value.
const FILLER = [
  "rotate", "nightly", "archive", "billing", "dashboard", "export", "quarterly", "invoice", "report", "template",
  "calendar", "holiday", "schedule", "onboarding", "checklist", "newsletter", "sidebar", "tooltip", "locale", "avatar",
  "pagination", "breadcrumb", "favicon", "changelog", "glossary", "survey", "webinar", "roadmap", "billing", "wiki",
];

function placebo(real: EvidenceCard, seed: number): EvidenceCard {
  const need = countTokens(real.statement); // match the statement length exactly, so the whole block matches
  const start = seed % FILLER.length;
  const statement = Array.from({ length: need }, (_, i) => FILLER[(start + i) % FILLER.length]).join(" ");
  const target = `lg-${sha256(`placebo|${seed}|${real.memoryId}`).slice(0, 6)}`;
  return { ...real, memoryId: `${real.memoryId}-p`, statement, value: { action: "rotate_logs", target } };
}

export function buildArms(cp: Checkpoint): Record<ProofArm, ArmSpec> {
  const swap = (cards: EvidenceCard[]): EvidenceCard[] => JSON.parse(JSON.stringify(cards).split(cp.nonce).join(cp.otherPool));
  return {
    R: { cards: cp.realCards, truth: cp.realTruth },
    O: { cards: [], truth: cp.realTruth },
    P: { cards: cp.realCards.map((c) => placebo(c, cp.seed)), truth: cp.realTruth },
    C: { cards: swap(cp.realCards), truth: { ...cp.realTruth, args: { pool: cp.otherPool } } },
  };
}
