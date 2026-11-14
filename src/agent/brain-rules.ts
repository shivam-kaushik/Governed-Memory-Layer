import type { Action, Alert, Brain, EvidenceCard } from "../contracts/contracts";
import { POOL_RE } from "./tools";

export interface Rationale {
  rule: string;
  evidenceIds: string[];
  explanation?: string; // free text from a model: shown to the operator, never written to trace or audit
}

// Brain may also explain itself; the trace records the rationale (ids only).
export interface AgentBrain extends Brain {
  decideWithRationale?(alert: Alert, cards: EvidenceCard[], notes?: string[]): Promise<{ action: Action; rationale: Rationale }>;
}

// Deterministic rule brain. Proves plumbing and governance, not model behavior.
// It acts only on a well-formed cache-pool fix: nothing in memory text can add a tool.
export const ruleBrain: Required<AgentBrain> = {
  async decideWithRationale(_alert, cards): Promise<{ action: Action; rationale: Rationale }> {
    const top = cards
      .filter((c) => c.value.action === "restart_cache_pool" && typeof c.value.pool === "string" && POOL_RE.test(c.value.pool))
      .sort((a, b) => b.score - a.score || a.memoryId.localeCompare(b.memoryId))[0];
    if (top) {
      return {
        action: { tool: "restart_cache_pool", args: { pool: String(top.value.pool) }, usedMemoryIds: [top.memoryId] },
        rationale: { rule: "apply_top_evidence", evidenceIds: [top.memoryId] },
      };
    }
    return {
      action: { tool: "investigate", args: {}, usedMemoryIds: [] },
      rationale: cards.length
        ? { rule: "no_usable_evidence", evidenceIds: cards.map((c) => c.memoryId) }
        : { rule: "no_applicable_evidence", evidenceIds: [] },
    };
  },
  async decide(alert, cards) {
    return (await this.decideWithRationale(alert, cards)).action;
  },
};
