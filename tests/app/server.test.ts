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
    const s = await buildDemoServer({ GML_DEMO: "1", GML_MANUAL: "1" });
    const alert = ((await get(s, "/api/live/alerts", "tok-a-resp")).json as { alerts: { id: string }[] }).alerts[0]!;
    const first = (await post(s, "/api/live/run", "tok-a-resp", { alertId: alert.id })).json as { action: { tool: string } };
    expect(first.action.tool).toBe("restart_cache_pool");
    expect((await post(s, "/api/live/clock", "tok-a-resp", { op: "jump_to_expiry" })).status).toBe(200);
    const second = (await post(s, "/api/live/run", "tok-a-resp", { alertId: alert.id })).json as { action: { tool: string } };
    expect(second.action.tool).toBe("investigate");
  });

  it("team_b_cannot_read_team_a_trace", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1", GML_MANUAL: "1" });
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

describe("demo server brain selection and autonomy", () => {
  const scriptedFetch = () => {
    const bodies: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const body = String(init.body);
      bodies.push(body);
      const pool = body.match(/findings>[\s\S]*?(cp-[0-9a-f]{6})/)?.[1];
      const mem = body.match(/id=(\S+) v\d[\s\S]*?pool\\?":\\?"(cp-[0-9a-f]{6})/);
      const input = mem
        ? { tool: "restart_cache_pool", args: { pool: mem[2] }, usedMemoryIds: [mem[1]], explanation: "known fix" }
        : pool
          ? { tool: "restart_cache_pool", args: { pool }, usedMemoryIds: [], explanation: "from findings" }
          : { tool: "investigate", args: {}, usedMemoryIds: [], explanation: "need info" };
      return new Response(JSON.stringify({ content: [{ type: "tool_use", id: "t", name: "choose_action", input }] }), { status: 200 });
    }) as unknown as typeof fetch;
    return { f, bodies };
  };
  type Run = { brain: string; turns: { action: { tool: string; usedMemoryIds: string[] }; explanation?: string }[]; fixed: boolean };

  it("without_api_key_brain_is_labeled_rule_brain", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1", GML_MANUAL: "1" });
    const r = (await post(s, "/api/live/run", "tok-a-resp", { alertId: "alert-1" })).json as Run;
    expect(r.brain).toBe("rule-brain");
  });

  it("with_api_key_llm_agent_investigates_fixes_and_learns_then_reuses_memory", async () => {
    const { f } = scriptedFetch();
    const s = await buildDemoServer({ GML_DEMO: "1", GML_MANUAL: "1", GML_WORLD: "no_precedent", ANTHROPIC_API_KEY: "sk-test", GML_MODEL: "m-1" }, { fetch: f });
    const one = (await post(s, "/api/live/run", "tok-a-resp", { alertId: "alert-1" })).json as Run;
    expect(one.brain).toBe("llm:m-1");
    expect(one.turns.map((t) => t.action.tool)).toEqual(["investigate", "restart_cache_pool"]);
    expect(one.fixed).toBe(true);
    const mems = ((await get(s, "/api/memories", "tok-a-resp")).json as { memories: unknown[] }).memories;
    expect(mems).toHaveLength(1);
    const two = (await post(s, "/api/live/run", "tok-a-resp", { alertId: "alert-1" })).json as Run;
    expect(two.turns.map((t) => t.action.tool)).toEqual(["restart_cache_pool"]);
    expect(two.turns[0]!.explanation).toBe("known fix");
    expect(two.turns[0]!.action.usedMemoryIds).toHaveLength(1);
  });

  it("team_b_agent_cannot_use_team_a_learned_memory", async () => {
    const { f } = scriptedFetch();
    const s = await buildDemoServer({ GML_DEMO: "1", GML_MANUAL: "1", GML_WORLD: "no_precedent", ANTHROPIC_API_KEY: "sk-test" }, { fetch: f });
    await post(s, "/api/live/run", "tok-a-resp", { alertId: "alert-1" });
    const b = (await post(s, "/api/live/run", "tok-b-resp", { alertId: "alert-1" })).json as Run;
    expect(b.turns[0]!.action.tool).toBe("investigate");
  });
});

describe("demo server autonomy and notifications", () => {
  it("default_is_autonomous_so_manual_run_is_blocked", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    expect((await post(s, "/api/live/run", "tok-a-resp", { alertId: "alert-1" })).status).toBe(403);
  });

  it("status_reports_vonage_configured_flag_and_never_the_secret", async () => {
    const env = { GML_DEMO: "1", VONAGE_API_KEY: "KEY123", VONAGE_API_SECRET: "SECRET456", VONAGE_FROM: "GML", VONAGE_TO: "1555" };
    const s = await buildDemoServer(env);
    const r = await get(s, "/api/agent/status", "tok-a-resp");
    const text = JSON.stringify(r.json);
    expect((r.json as { agent: { notifierConfigured: boolean } }).agent.notifierConfigured).toBe(true);
    expect(text).not.toMatch(/SECRET456|KEY123|1555/);
    const off = await buildDemoServer({ GML_DEMO: "1" });
    expect(((await get(off, "/api/agent/status", "tok-a-resp")).json as { agent: { notifierConfigured: boolean } }).agent.notifierConfigured).toBe(false);
  });

  it("autostart_off_by_default_so_tests_and_builds_start_no_timers", async () => {
    const s = await buildDemoServer({ GML_DEMO: "1" });
    expect(((await get(s, "/api/agent/status", "tok-a-resp")).json as { agent: { running: boolean } }).agent.running).toBe(false);
  });
});
