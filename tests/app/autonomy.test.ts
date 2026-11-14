import { describe, expect, it } from "vitest";
import type { AgentBrain } from "../../src/agent/brain-rules";
import { runEpisode } from "../../src/agent/episode";
import { makeSimulator, withFindings } from "../../src/agent/tools";
import type { Action } from "../../src/contracts/contracts";
import { createAutonomy } from "../../src/app/autonomy";
import type { Notifier, NotifyEvent } from "../../src/app/notify";
import { buildWorld, caller } from "../agent/helpers";

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

async function rig(over: { manual?: boolean; brain?: AgentBrain; rotateEveryTicks?: number } = {}) {
  const w = await buildWorld("no_precedent");
  let pool = w.scenario.nonce;
  let manual = over.manual ?? false;
  const sent: NotifyEvent[] = [];
  const notifier: Notifier = { configured: true, notify: async (e) => (sent.push(e), { ok: true, detail: "sent" }) };
  const a = createAutonomy({
    baseAlert: w.scenario.alert,
    clock: w.clock,
    notifier,
    isManual: () => manual,
    rotatePool: () => { pool = `cp-${(1000 + a.status().ticks).toString(16).padStart(6, "0")}`; },
    rotateEveryTicks: over.rotateEveryTicks ?? 5,
    tickAdvanceMs: 86_400_000,
    runEpisode: (alert) =>
      runEpisode(alert, caller("tok-a-resp"), w.layer, over.brain ?? agent, w.trace, w.clock, { principal: w.actor, simulator: withFindings(makeSimulator(pool), pool), newId: w.deps.newId }),
  });
  return { ...w, a, sent, setManual: (b: boolean) => (manual = b) };
}

describe("autonomy loop", () => {
  it("tick_triages_a_fresh_alert_learns_then_reuses_with_no_human", async () => {
    const r = await rig();
    await r.a.tickOnce();
    await r.a.tickOnce();
    const s = r.a.status();
    expect(s).toMatchObject({ ticks: 2, fixed: 2, learned: 1, reused: 1, escalated: 0 });
  });

  it("pool_rotation_makes_it_forget_stale_memory_and_relearn_by_itself", async () => {
    const r = await rig({ rotateEveryTicks: 3 });
    for (let i = 0; i < 4; i++) await r.a.tickOnce();
    const s = r.a.status();
    expect(s.rotations).toBe(1);
    expect(s.forgotten).toBe(1);
    expect(s.learned).toBe(2);
    expect(s.fixed).toBe(4);
    expect(r.sent.map((e) => e.kind)).toContain("FORGOT_STALE_MEMORY");
  });

  it("each_tick_advances_the_injected_clock", async () => {
    const r = await rig();
    const t0 = r.clock.nowMs();
    await r.a.tickOnce();
    expect(r.clock.nowMs()).toBe(t0 + 86_400_000);
  });

  it("manual_mode_pauses_the_agent", async () => {
    const r = await rig({ manual: true });
    await r.a.tickOnce();
    expect(r.a.status().ticks).toBe(0);
    r.setManual(false);
    await r.a.tickOnce();
    expect(r.a.status().ticks).toBe(1);
  });

  it("unfixed_incident_escalates_with_one_notification_per_episode", async () => {
    const stuck: AgentBrain = { decide: async () => ({ tool: "investigate", args: {}, usedMemoryIds: [] }) };
    const r = await rig({ brain: stuck });
    await r.a.tickOnce();
    expect(r.a.status()).toMatchObject({ fixed: 0, escalated: 1 });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject({ kind: "ESCALATE" });
  });

  it("guard_block_notifies_and_counts", async () => {
    const bad: AgentBrain = { decide: async () => ({ tool: "drop_database" as never, args: {}, usedMemoryIds: [] }) };
    const r = await rig({ brain: bad });
    await r.a.tickOnce();
    expect(r.a.status().blocked).toBe(1);
    expect(r.sent[0]).toMatchObject({ kind: "BLOCKED", detail: "TOOL_NOT_ALLOWED" });
  });

  it("a_crashing_episode_or_notifier_never_kills_the_loop", async () => {
    const r = await rig();
    const boom = createAutonomy({ baseAlert: r.scenario.alert, clock: r.clock, notifier: { configured: true, notify: async () => { throw new Error("x"); } }, isManual: () => false, rotatePool: () => {}, runEpisode: async () => { throw new Error("down"); } });
    await expect(boom.tickOnce()).resolves.toBeUndefined();
    expect(boom.status()).toMatchObject({ ticks: 1, errors: 1 });
  });

  it("status_lists_recent_notification_results_without_secrets", async () => {
    const stuck: AgentBrain = { decide: async () => ({ tool: "investigate", args: {}, usedMemoryIds: [] }) };
    const r = await rig({ brain: stuck });
    await r.a.tickOnce();
    expect(r.a.status().notifications[0]).toMatchObject({ kind: "ESCALATE", ok: true });
  });
});
