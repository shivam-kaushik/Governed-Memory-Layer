import { describe, expect, it } from "vitest";
import { A_RESP, A_REV, apiWorld } from "./helpers";

const manual = (initial: boolean) => {
  let on = initial;
  return { get: () => on, set: (b: boolean) => void (on = b) };
};

describe("autonomous by default, manual is a switch", () => {
  it("manual_actions_are_403_MANUAL_DISABLED_when_off", async () => {
    const w = await apiWorld("valid_fix", 1, { manual: manual(false) });
    const id = w.scenario.memoriesToSeed[0]!._id;
    for (const [path, body] of [
      ["/api/live/run", { alertId: w.scenario.alert.id }],
      ["/api/live/clock", { op: "advance_day" }],
      ["/api/memories/forget", { id, reason: "x" }],
      ["/api/memories/correct", { id, reason: "x", text: "y" }],
    ] as const) {
      const r = await w.call("POST", path, A_REV, body);
      expect([r.status, (r.json as { error: string }).error]).toEqual([403, "MANUAL_DISABLED"]);
    }
    expect((await w.call("GET", "/api/memories", A_REV)).status).toBe(200);
  });

  it("manual_actions_work_when_on", async () => {
    const w = await apiWorld("valid_fix", 1, { manual: manual(true) });
    expect((await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id })).status).toBe(200);
  });

  it("only_reviewer_or_admin_can_flip_the_switch_and_it_takes_effect", async () => {
    const m = manual(false);
    const w = await apiWorld("valid_fix", 1, { manual: m });
    expect((await w.call("POST", "/api/agent/mode", A_RESP, { manual: true })).status).toBe(403);
    expect(m.get()).toBe(false);
    expect((await w.call("POST", "/api/agent/mode", A_REV, { manual: true })).status).toBe(200);
    expect(m.get()).toBe(true);
    expect((await w.call("POST", "/api/agent/mode", A_REV, { manual: "yes" })).status).toBe(400);
  });

  it("status_needs_session_and_reports_mode_and_agent_state", async () => {
    const w = await apiWorld("valid_fix", 1, { manual: manual(false), agentStatus: () => ({ ticks: 3 }) });
    expect((await w.call("GET", "/api/agent/status")).status).toBe(401);
    const r = (await w.call("GET", "/api/agent/status", A_RESP)).json as { manual: boolean; agent: { ticks: number } };
    expect(r).toEqual({ manual: false, agent: { ticks: 3 } });
  });
});
