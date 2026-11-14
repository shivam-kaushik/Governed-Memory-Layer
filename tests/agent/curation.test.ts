import { describe, expect, it } from "vitest";
import type { AgentBrain } from "../../src/agent/brain-rules";
import { runEpisode } from "../../src/agent/episode";
import { makeSimulator, withFindings, type ToolSimulator } from "../../src/agent/tools";
import type { Action } from "../../src/contracts/contracts";
import { buildWorld, caller } from "./helpers";

// Stand-in model: trusts recalled memory, else follows tool findings, else investigates.
const agent: AgentBrain = {
  async decide(a, c) {
    return (await this.decideWithRationale!(a, c, [])).action;
  },
  async decideWithRationale(_a, cards, notes = []) {
    const mem = cards.find((c) => c.value.action === "restart_cache_pool");
    const pool = mem ? String(mem.value.pool) : notes.join(" ").match(/cp-[0-9a-f]{6}/)?.[0];
    const action: Action = pool ? { tool: "restart_cache_pool", args: { pool }, usedMemoryIds: mem ? [mem.memoryId] : [] } : { tool: "investigate", args: {}, usedMemoryIds: [] };
    return { action, rationale: { rule: "llm_decision", evidenceIds: action.usedMemoryIds } };
  },
};
const sim = (pool: string): ToolSimulator => withFindings(makeSimulator(pool), pool);

describe("agent curates its own memory", () => {
  it("memory_that_stops_working_is_forgotten_then_agent_relearns_the_new_fix", async () => {
    const w = await buildWorld("no_precedent");
    const ctx = (s: ToolSimulator) => ({ principal: w.actor, simulator: s, newId: w.deps.newId });
    const run = (s: ToolSimulator) => runEpisode(w.scenario.alert, caller("tok-a-resp"), w.layer, agent, w.trace, w.clock, ctx(s));
    await run(sim(w.scenario.nonce));
    const rotated = "cp-0000aa";
    const e = await run(sim(rotated));
    expect(e.turns.map((t) => t.action.tool)).toEqual(["restart_cache_pool", "investigate", "restart_cache_pool"]);
    expect(e.turns[0]!.forgotten).toHaveLength(1);
    expect(e.turns[2]!.result.fixed).toBe(true);
    expect(e.fixed).toBe(true);
    const next = await run(sim(rotated));
    expect(next.turns).toHaveLength(1);
    expect(next.turns[0]!.action.args).toEqual({ pool: rotated });
    expect(next.turns[0]!.action.usedMemoryIds).toHaveLength(1);
  });

  it("forget_is_audited_and_traced_as_ids_only", async () => {
    const w = await buildWorld("no_precedent");
    const run = (s: ToolSimulator) => runEpisode(w.scenario.alert, caller("tok-a-resp"), w.layer, agent, w.trace, w.clock, { principal: w.actor, simulator: s, newId: w.deps.newId });
    await run(sim(w.scenario.nonce));
    const e = await run(sim("cp-0000aa"));
    const written = (await w.trace.listByTrace(w.actor, e.turns[0]!.traceId)).find((x) => x.step === "memory_written")!;
    expect(written.payload).toMatchObject({ forgotten: e.turns[0]!.forgotten, reason: "MEMORY_PROVED_WRONG" });
    expect((await w.audit.list(w.actor, 100)).some((a) => a.op === "forget" && a.decision === "allow")).toBe(true);
  });

  it("responder_cannot_forget_team_memory_so_it_is_denied_not_thrown", async () => {
    const w = await buildWorld("valid_fix"); // seeded memory is team scope
    const o = await w.run(agent, sim("cp-0000aa"));
    expect(o.result).toMatchObject({ executed: true, fixed: false });
    expect(o.forgotten).toBeUndefined();
    const written = (await w.trace.listByTrace(w.actor, o.traceId)).find((x) => x.step === "memory_written")!;
    expect(written.payload).toMatchObject({ skipped: true, reason: "FORGET_DENIED" });
  });

  it("a_fixed_memory_use_is_never_forgotten", async () => {
    const w = await buildWorld("valid_fix");
    const o = await w.run(agent, sim(w.scenario.nonce));
    expect(o.result.fixed).toBe(true);
    expect(o.forgotten).toBeUndefined();
  });
});
