import { describe, expect, it } from "vitest";
import { ruleBrain } from "../../src/agent/brain-rules";
import type { MemoryLayer } from "../../src/contracts/contracts";
import { behaviorExperiment, correctExperiment, expiryCheck, expiryStart, forgetExperiment, isolationExperiment, type JudgeEnv } from "../../src/app/judge";
import { buildWorld } from "../agent/helpers";

async function env(over: Partial<JudgeEnv> = {}, layerWrap?: (l: MemoryLayer) => MemoryLayer) {
  const w = await buildWorld("valid_fix", 1);
  const a = w.scenario.alert;
  const e: JudgeEnv = {
    layer: layerWrap ? layerWrap(w.layer) : w.layer,
    reads: { listMemories: (p, s) => w.repo.listMemories(p, s), listAudit: (p, n) => w.audit.list(p, n) },
    resolver: w.deps.resolvePrincipal,
    tokens: { eco: "tok-a-resp", ecoReviewer: "tok-a-rev", other: "tok-b-resp" },
    brain: ruleBrain,
    nonce: "n1",
    now: () => w.clock.nowMs(),
    query: { text: a.text, service: a.service, version: a.version, environment: a.environment },
    ...over,
  };
  return { w, e };
}

describe("Q1 isolation experiment", () => {
  it("every_probe_passes_for_a_governed_layer", async () => {
    const { e } = await env();
    const r = await isolationExperiment(e);
    expect(r.steps.length).toBeGreaterThanOrEqual(5);
    expect(r.steps.filter((s) => !s.ok)).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it("fails_when_the_other_client_can_read_the_team_memory", async () => {
    // Mutation: route the other client's recall through the eco session, as if tenant filtering were removed.
    const { e } = await env({}, (l) => ({ ...l, recall: (q, c) => l.recall(q, c.sessionToken === "tok-b-resp" ? { ...c, sessionToken: "tok-a-resp" } : c) }));
    const r = await isolationExperiment(e);
    expect(r.pass).toBe(false);
  });

  it("other_client_cannot_correct_or_forget_by_id", async () => {
    const { e } = await env();
    const r = await isolationExperiment(e);
    expect(r.steps.find((s) => /forget by id/i.test(s.label))!.ok).toBe(true);
  });
});

describe("Q2 expiry", () => {
  it("memory_is_eligible_before_expiry_and_rejected_with_EXPIRED_after", async () => {
    const { w, e } = await env();
    const s = await expiryStart(e, 15_000);
    expect((await expiryCheck(e, s.id)).eligible).toBe(true);
    w.clock.advanceMs!(15_000); // exactly expiresAt: now >= expiresAt is ineligible
    const c = await expiryCheck(e, s.id);
    expect(c.eligible).toBe(false);
    expect(c.reason).toBe("EXPIRED");
  });
});

describe("Q2 correct and forget", () => {
  it("correct_supersedes_and_only_the_new_version_is_recalled", async () => {
    const { e } = await env();
    const r = await correctExperiment(e);
    expect(r.steps.filter((s) => !s.ok)).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it("forget_cascades_probes_come_back_empty_and_unrelated_memory_survives", async () => {
    const { e } = await env();
    const r = await forgetExperiment(e);
    expect(r.steps.filter((s) => !s.ok)).toEqual([]);
    expect(r.steps.some((s) => /unrelated/i.test(s.label))).toBe(true);
    expect(r.pass).toBe(true);
  });
});

describe("Q3 behavior experiment", () => {
  it("only_the_counterfactual_changes_the_pool_and_placebo_matches_length", async () => {
    const { e } = await env();
    const r = await behaviorExperiment(e);
    const arm = (a: string) => r.arms.find((x) => x.arm === a)!;
    expect(arm("R").action.args.pool).toBe(r.truePool);
    expect(arm("O").action.tool).toBe("investigate");
    expect(arm("P").action.args.pool).not.toBe(r.truePool);
    expect(arm("C").action.args.pool).toBe(r.otherPool);
    expect(r.otherPool).not.toBe(r.truePool);
    expect(Math.abs(arm("P").memoryTokens - arm("R").memoryTokens) / arm("R").memoryTokens).toBeLessThanOrEqual(0.02);
    expect(r.pass).toBe(true);
  });
  it("fails_when_the_brain_ignores_memory", async () => {
    const { e } = await env({ brain: { decide: async () => ({ tool: "investigate", args: {}, usedMemoryIds: [] }) } });
    expect((await behaviorExperiment(e)).pass).toBe(false);
  });
});
