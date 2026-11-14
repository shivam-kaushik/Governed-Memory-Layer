import { describe, expect, it } from "vitest";
import { buildDemoServer } from "../../src/app/server";

const get = (s: Awaited<ReturnType<typeof buildDemoServer>>, path: string, token?: string) =>
  s.handle({ method: "GET", path, headers: token ? { authorization: `Bearer ${token}` } : {} });
const post = (s: Awaited<ReturnType<typeof buildDemoServer>>, path: string, token: string, body: unknown) =>
  s.handle({ method: "POST", path, headers: { authorization: `Bearer ${token}` }, body });

describe("demo server", () => {
  it("demo_off_by_default_hides_clock_route", async () => {
    const s = await buildDemoServer({});
    expect((await post(s, "/api/live/clock", "tok-a-resp", { op: "advance_day" })).status).toBe(404);
  });

  it("demo_tokens_are_listed_by_label_only_when_demo_on", async () => {
    expect((await buildDemoServer({})).sessions).toEqual([]);
    const on = await buildDemoServer({ GML_DEMO: "1" });
    expect(on.sessions.map((x) => x.token)).toContain("tok-a-resp");
    expect(JSON.stringify(on.sessions)).not.toMatch(/tenant/i);
  });

  it("unauthenticated_is_401_and_known_token_lists_memories", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    expect((await get(s, "/api/memories")).status).toBe(401);
    const r = await get(s, "/api/memories", "tok-a-resp");
    expect(r.status).toBe(200);
    expect((r.json as { memories: unknown[] }).memories.length).toBeGreaterThan(0);
  });

  it("live_run_uses_memory_then_expiry_flips_it_to_investigate", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    const alert = ((await get(s, "/api/live/alerts", "tok-a-resp")).json as { alerts: { id: string }[] }).alerts[0]!;
    const first = (await post(s, "/api/live/run", "tok-a-resp", { alertId: alert.id })).json as { action: { tool: string } };
    expect(first.action.tool).toBe("restart_cache_pool");
    expect((await post(s, "/api/live/clock", "tok-a-resp", { op: "jump_to_expiry" })).status).toBe(200);
    const second = (await post(s, "/api/live/run", "tok-a-resp", { alertId: alert.id })).json as { action: { tool: string } };
    expect(second.action.tool).toBe("investigate");
  });

  it("team_b_cannot_read_team_a_trace", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    const alert = ((await get(s, "/api/live/alerts", "tok-a-resp")).json as { alerts: { id: string }[] }).alerts[0]!;
    const run = (await post(s, "/api/live/run", "tok-a-resp", { alertId: alert.id })).json as { traceId: string };
    expect((await get(s, `/api/traces/${run.traceId}`, "tok-a-resp")).status).toBe(200);
    expect((await get(s, `/api/traces/${run.traceId}`, "tok-b-resp")).status).toBe(404);
  });

  it("proof_route_reports_which_brain_and_seed_count", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    const rep = (await get(s, "/api/proof", "tok-a-rev")).json as { report: { brain: string; seeds: number } };
    expect(rep.report.brain).toBe("rule-brain");
    expect(rep.report.seeds).toBe(20);
  });
});
