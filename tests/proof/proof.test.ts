import { beforeAll, describe, expect, it } from "vitest";
import { ruleBrain } from "../../src/agent/brain-rules";
import type { Action, Brain, EvidenceCard } from "../../src/contracts/contracts";
import { buildArms } from "../../src/eval/arms";
import { buildCheckpoint } from "../../src/eval/checkpoint";
import { countTokens, promptParts, renderMemoryBlock, renderPrompt } from "../../src/eval/prompt";
import { adoptedStale, runProof, type ProofReport } from "../../src/eval/run";
import { scoreRun, type ScorerInput } from "../../src/eval/scorers";
import { FakeEvalStore } from "../../src/fakes/fake-eval-store";

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const ARMS = ["R", "O", "P", "C"] as const;
const INVESTIGATE: Action = { tool: "investigate", args: {}, usedMemoryIds: [] };

let report: ProofReport;
const store = new FakeEvalStore();
const scored: ScorerInput[] = [];

beforeAll(async () => {
  report = await runProof(SEEDS, ruleBrain, {
    brainName: "deterministic-rules",
    evalStore: store,
    scorer: (x) => (scored.push(x), scoreRun(x)),
  });
});

describe("prompt and arms are frozen except the memory block (G20)", () => {
  it("prompt_identical_outside_memory_block", async () => {
    for (const seed of SEEDS) {
      const cp = await buildCheckpoint(seed);
      const arms = buildArms(cp);
      const parts = ARMS.map((a) => promptParts(cp.alert, arms[a].cards));
      for (const p of parts) {
        expect(p.head).toBe(parts[0]!.head);
        expect(p.tail).toBe(parts[0]!.tail);
        expect(p.head + p.tail).not.toContain(cp.nonce);
        expect(p.head + p.tail).not.toContain(cp.otherPool);
      }
      expect(parts[0]!.head).toContain(cp.alert.text);
      ARMS.forEach((a, i) => expect(renderPrompt(cp.alert, arms[a].cards)).toBe(parts[i]!.head + parts[i]!.memoryBlock + parts[i]!.tail));
      // only the real and counterfactual arms carry a pool at all
      expect(parts[0]!.memoryBlock).toContain(cp.nonce); // R
      expect(parts[1]!.memoryBlock).not.toContain(cp.nonce); // O
      expect(parts[2]!.memoryBlock).not.toContain(cp.nonce); // P
      expect(parts[3]!.memoryBlock).not.toContain(cp.nonce); // C
      expect(parts[3]!.memoryBlock).toContain(cp.otherPool);
    }
  });

  it("placebo_token_length_within_2pct, same card count, same fields, same position", async () => {
    for (const seed of SEEDS) {
      const cp = await buildCheckpoint(seed);
      const { R, P } = buildArms(cp);
      const real = countTokens(renderMemoryBlock(R.cards));
      const placebo = countTokens(renderMemoryBlock(P.cards));
      expect(Math.abs(placebo - real) / real).toBeLessThanOrEqual(0.02);
      expect(P.cards).toHaveLength(R.cards.length);
      P.cards.forEach((c, i) => {
        expect(Object.keys(c).sort()).toEqual(Object.keys(R.cards[i]!).sort());
        expect(JSON.stringify(c)).not.toContain(cp.nonce);
        expect(JSON.stringify(c)).not.toContain(cp.otherPool);
        expect(c.statement).not.toBe(R.cards[i]!.statement);
      });
    }
  });

  it("nonces are generated per seed and never reused across seeds", async () => {
    const nonces = new Set<string>();
    for (const seed of SEEDS) nonces.add((await buildCheckpoint(seed)).nonce);
    expect(nonces.size).toBe(SEEDS.length);
  });

  it("the real arm carries the memory that governed recall actually returned", async () => {
    const cp = await buildCheckpoint(7);
    expect(cp.realCards).toHaveLength(1);
    expect(cp.realCards[0]!.value).toMatchObject({ action: "restart_cache_pool", pool: cp.nonce });
  });
});

describe("proof targets with the deterministic brain (plumbing, not model behavior)", () => {
  it("reports its brain and raw counts", () => {
    expect(report.brain).toBe("deterministic-rules");
    expect(report.seeds).toBe(30);
    for (const a of ARMS) expect(report.arms[a].n).toBe(30);
    expect(report.arms.R.success).toBe(Math.round(report.arms.R.rate * 30));
  });

  it("arm_R_success_ge_95pct", () => {
    expect(report.arms.R.rate).toBeGreaterThanOrEqual(0.95);
  });

  it("arm_O_and_P_fail_on_nonce_tasks", () => {
    expect(report.arms.O.success).toBe(0);
    expect(report.arms.P.success).toBe(0);
    expect(report.arms.O.ci[1]).toBeLessThan(0.2); // Wilson upper bound, n = 30
    expect(report.arms.P.ci[1]).toBeLessThan(0.2);
  });

  it("R minus P uplift lower CI bound is at least 15 points", () => {
    expect(report.uplift.rMinusP).toBeGreaterThan(0.9);
    expect(report.uplift.lower).toBeGreaterThanOrEqual(0.15);
  });

  it("counterfactual_changes_only_target_arg", async () => {
    for (const seed of SEEDS) {
      const cp = await buildCheckpoint(seed);
      const { R, C } = buildArms(cp);
      // the evidence differs in exactly one fact: the pool
      expect(JSON.stringify(C.cards).split(cp.otherPool).join(cp.nonce)).toBe(JSON.stringify(R.cards));
      expect(C.truth).toEqual({ ...R.truth, args: { pool: cp.otherPool } });
      // and the action differs in exactly that arg
      const [aR, aC] = [await ruleBrain.decide(cp.alert, R.cards), await ruleBrain.decide(cp.alert, C.cards)];
      expect(aC.tool).toBe(aR.tool);
      expect(aC.usedMemoryIds).toEqual(aR.usedMemoryIds);
      expect(Object.keys(aC.args)).toEqual(Object.keys(aR.args));
      expect(aC.args.pool).toBe(cp.otherPool);
      expect(aR.args.pool).toBe(cp.nonce);
    }
    expect(report.targetedResponse).toBeGreaterThanOrEqual(0.9);
    expect(report.collateralStability).toBeGreaterThanOrEqual(0.98);
  });

  it("harmful_adoption_zero_for_expired_wrongversion_foreign_deleted", () => {
    expect(report.harmfulTrials).toBe(4 * SEEDS.length);
    expect(report.harmfulAdoption).toBe(0);
  });

  it("adoptedStale detects use of a stale memory's fix", async () => {
    const cp = await buildCheckpoint(3);
    const adopt: Action = { tool: "restart_cache_pool", args: { pool: cp.nonce }, usedMemoryIds: ["x"] };
    expect(adoptedStale(adopt, cp.nonce)).toBe(true);
    expect(adoptedStale({ tool: "restart_cache_pool", args: { pool: cp.nonce }, usedMemoryIds: [] }, cp.nonce)).toBe(true);
    expect(adoptedStale(INVESTIGATE, cp.nonce)).toBe(false);
  });
});

describe("the harness is not rigged", () => {
  it("a brain that ignores memory scores 0 on the real arm, and the report says so", async () => {
    const blind: Brain = { decide: async () => ({ tool: "restart_cache_pool", args: { pool: "cp-000000" }, usedMemoryIds: [] }) };
    const r = await runProof(SEEDS.slice(0, 20), blind, { brainName: "blind" });
    expect(r.arms.R.success).toBe(0);
    expect(r.arms.R.rate).toBe(0);
    expect(r.uplift.lower).toBeLessThan(0.15);
  });

  it("a brain that acts on any card regardless of content is caught by the placebo arm", async () => {
    const credulous: Brain = {
      decide: async (_a, cards: EvidenceCard[]) =>
        cards[0] ? { tool: "restart_cache_pool", args: { pool: String(Object.values(cards[0].value)[1]) }, usedMemoryIds: [cards[0].memoryId] } : INVESTIGATE,
    };
    const r = await runProof(SEEDS.slice(0, 20), credulous, { brainName: "credulous" });
    expect(r.arms.P.success).toBe(0); // the placebo's value is not the nonce
    expect(r.arms.R.rate).toBe(1);
  });

  it("rejects duplicate seeds, because nonces must not be reused", async () => {
    await expect(runProof([1, 2, 2], ruleBrain)).rejects.toThrow(/duplicate/i);
  });
});

describe("scorer is blind to the arm (G20)", () => {
  it("scorer_blind_to_arm: inputs carry no arm label, run ids are opaque", () => {
    expect(scored).toHaveLength(4 * SEEDS.length);
    for (const s of scored) {
      expect(Object.keys(s).sort()).toEqual(["action", "evidenceIds", "runId", "truth"]);
      expect(s.runId).toMatch(/^run-[0-9a-f]{12}$/);
      expect(JSON.stringify(s)).not.toMatch(/"arm"/);
    }
    expect(new Set(scored.map((s) => s.runId)).size).toBe(scored.length);
  });

  it("scoring is a pure function of action, truth and evidence ids", () => {
    const truth: Action = { tool: "restart_cache_pool", args: { pool: "cp-aaaaaa" }, usedMemoryIds: ["m1"] };
    const good: ScorerInput = { runId: "run-000000000001", action: truth, truth, evidenceIds: ["m1"] };
    const again = { ...good, runId: "run-000000000002" };
    const { runId: _a, ...s1 } = scoreRun(good);
    const { runId: _b, ...s2 } = scoreRun(again);
    expect(s1).toEqual(s2);
    expect(s1).toMatchObject({ toolMatch: true, argMatch: true, memoryDriven: true, success: true });
  });

  it.each([
    ["wrong pool", { tool: "restart_cache_pool", args: { pool: "cp-bbbbbb" }, usedMemoryIds: ["m1"] }, { argMatch: false, success: false }],
    ["wrong tool", { tool: "investigate", args: {}, usedMemoryIds: [] }, { toolMatch: false, success: false }],
    ["right pool, memory not cited", { tool: "restart_cache_pool", args: { pool: "cp-aaaaaa" }, usedMemoryIds: [] }, { argMatch: true, memoryDriven: false, success: false }],
    ["right pool, cites an id not in evidence", { tool: "restart_cache_pool", args: { pool: "cp-aaaaaa" }, usedMemoryIds: ["zzz"] }, { memoryDriven: false, success: false }],
  ])("scores %s as failure", (_n, action, expected) => {
    const truth: Action = { tool: "restart_cache_pool", args: { pool: "cp-aaaaaa" }, usedMemoryIds: ["m1"] };
    expect(scoreRun({ runId: "run-000000000003", action: action as Action, truth, evidenceIds: ["m1"] })).toMatchObject(expected);
  });
});

describe("runs are saved through the EvalStore", () => {
  it("saves one run per arm per seed with the arm recorded for the dashboard", async () => {
    const all = (await Promise.all(SEEDS.map((s) => store.listRuns(`proof-${s}`)))).flat();
    expect(all).toHaveLength(4 * SEEDS.length);
    expect(new Set(all.map((r) => r.arm))).toEqual(new Set(ARMS));
    const rReal = all.filter((r) => r.arm === "R");
    expect(rReal.every((r) => r.scores.success === true)).toBe(true);
  });
});
