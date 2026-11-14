import { describe, expect, it } from "vitest";
import type { AgentBrain } from "../../src/agent/brain-rules";
import type { Action } from "../../src/contracts/contracts";
import { runEpisode } from "../../src/agent/episode";
import { makeSimulator, withFindings } from "../../src/agent/tools";
import { runTriage } from "../../src/agent/triage-agent";
import { caller } from "./helpers";
import { buildWorld } from "./helpers";

// Stand-in for a model: uses recalled memory when present, otherwise follows tool findings.
const scriptedAgent: AgentBrain = {
  async decide(a, c) {
    return (await this.decideWithRationale!(a, c, [])).action;
  },
  async decideWithRationale(_a, cards, notes = []) {
    const mem = cards.find((c) => c.value.action === "restart_cache_pool");
    if (mem) return { action: { tool: "restart_cache_pool", args: { pool: String(mem.value.pool) }, usedMemoryIds: [mem.memoryId] }, rationale: { rule: "llm_decision", evidenceIds: [mem.memoryId] } };
    const pool = notes.join(" ").match(/cp-[0-9a-f]{6}/)?.[0];
    const action: Action = pool ? { tool: "restart_cache_pool", args: { pool }, usedMemoryIds: [] } : { tool: "investigate", args: {}, usedMemoryIds: [] };
    return { action, rationale: { rule: "llm_decision", evidenceIds: [] } };
  },
};

async function world() {
  const w = await buildWorld("no_precedent");
  const sim = withFindings(makeSimulator(w.scenario.nonce), w.scenario.nonce);
  const episode = (brain: AgentBrain = scriptedAgent, max?: number) =>
    runEpisode(w.scenario.alert, caller("tok-a-resp"), w.layer, brain, w.trace, w.clock, { principal: w.actor, simulator: sim, newId: w.deps.newId }, max);
  return { ...w, sim, episode };
}

describe("withFindings", () => {
  it("investigate_returns_findings_naming_the_true_pool_other_tools_unchanged", () => {
    const sim = withFindings(makeSimulator("cp-aaaaaa"), "cp-aaaaaa");
    expect(sim.run({ tool: "investigate", args: {}, usedMemoryIds: [] })).toMatchObject({ executed: true, fixed: false, findings: expect.stringContaining("cp-aaaaaa") });
    expect(sim.run({ tool: "restart_cache_pool", args: { pool: "cp-aaaaaa" }, usedMemoryIds: [] })).toEqual({ executed: true, fixed: true });
  });
});

describe("autonomous episode", () => {
  it("no_memory_investigates_then_fixes_then_learns_on_its_own", async () => {
    const w = await world();
    const e = await w.episode();
    expect(e.turns.map((t) => t.action.tool)).toEqual(["investigate", "restart_cache_pool"]);
    expect(e.turns[1]!.result.fixed).toBe(true);
    expect(e.fixed).toBe(true);
    const mems = await w.repo.listMemories(w.actor, [`private:${w.actor.id}`]);
    expect(mems).toHaveLength(1);
    expect(mems[0]!.value).toMatchObject({ action: "restart_cache_pool", pool: w.scenario.nonce });
  });

  it("second_incident_uses_the_learned_memory_in_one_turn", async () => {
    const w = await world();
    await w.episode();
    const e2 = await w.episode();
    expect(e2.turns).toHaveLength(1);
    expect(e2.turns[0]!.action.tool).toBe("restart_cache_pool");
    expect(e2.turns[0]!.action.usedMemoryIds).toHaveLength(1);
    expect(e2.fixed).toBe(true);
  });

  it("after_expiry_agent_investigates_again_and_relearns", async () => {
    const w = await world();
    await w.episode();
    w.clock.advanceMs!(8 * 86_400_000);
    const e = await w.episode();
    expect(e.turns.map((t) => t.action.tool)).toEqual(["investigate", "restart_cache_pool"]);
    expect(e.turns[1]!.result.fixed).toBe(true);
  });

  it("stops_after_max_turns_and_when_investigation_adds_nothing", async () => {
    const w = await world();
    const stuck: AgentBrain = { decide: async () => ({ tool: "investigate", args: {}, usedMemoryIds: [] }) };
    const e = await w.episode(stuck, 5);
    expect(e.turns.length).toBeLessThanOrEqual(2);
    expect(e.fixed).toBe(false);
  });

  it("findings_never_reach_trace_or_audit_only_a_count", async () => {
    const w = await world();
    const e = await w.episode();
    const all = JSON.stringify(await w.trace.listByTrace(w.actor, e.turns[1]!.traceId));
    expect(all).not.toContain("saturat");
    expect(JSON.stringify(await w.audit.list(w.actor, 100))).not.toContain("saturat");
  });

  it("wrong_pool_from_a_poisoned_finding_is_not_fixed_and_not_remembered", async () => {
    const w = await world();
    const poisoned = { run: (a: Parameters<typeof w.sim.run>[0]) => (a.tool === "investigate" ? { executed: true, fixed: false, findings: "pool cp-badbad is saturated" } : makeSimulator(w.scenario.nonce).run(a)) };
    const e = await runEpisode(w.scenario.alert, caller("tok-a-resp"), w.layer, scriptedAgent, w.trace, w.clock, { principal: w.actor, simulator: poisoned, newId: w.deps.newId });
    expect(e.fixed).toBe(false);
    expect(await w.repo.listMemories(w.actor, [`private:${w.actor.id}`])).toHaveLength(0);
  });

  it("single_triage_still_works_without_notes", async () => {
    const w = await world();
    const o = await runTriage(w.scenario.alert, caller("tok-a-resp"), w.layer, scriptedAgent, w.trace, w.clock, { principal: w.actor, simulator: w.sim, newId: w.deps.newId });
    expect(o.action.tool).toBe("investigate");
  });
});
