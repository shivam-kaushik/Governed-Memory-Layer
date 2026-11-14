import { describe, expect, it } from "vitest";
import { A_RESP, apiWorld } from "./helpers";

type J = Record<string, any>;

describe("POST /api/judge/:action", () => {
  it("requires_a_session", async () => {
    const w = await apiWorld("valid_fix", 1, { judge: { run: async () => ({}) } });
    expect((await w.call("POST", "/api/judge/isolation")).status).toBe(401);
  });
  it("is_404_when_no_judge_harness_is_configured", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/judge/isolation", A_RESP, {})).status).toBe(404);
  });
  it("unknown_action_is_not_routed", async () => {
    const w = await apiWorld("valid_fix", 1, { judge: { run: async () => ({}) } });
    expect((await w.call("POST", "/api/judge/rm-rf", A_RESP, {})).status).toBe(404);
  });
  it("passes_only_the_action_and_a_validated_id_to_the_harness", async () => {
    let seen: { action: string; input: unknown } | undefined;
    const w = await apiWorld("valid_fix", 1, { judge: { run: async (action, input) => ((seen = { action, input }), { ok: true }) } });
    const r = await w.call("POST", "/api/judge/expiry-check", A_RESP, { id: "mem_1", tenantId: "tenant-b", token: "tok-b-resp" });
    expect(r.status).toBe(200);
    expect(seen).toEqual({ action: "expiry-check", input: { id: "mem_1" } });
    expect((r.json as J).ok).toBe(true);
  });
  it("rejects_a_malformed_id", async () => {
    const w = await apiWorld("valid_fix", 1, { judge: { run: async () => ({}) } });
    expect((await w.call("POST", "/api/judge/expiry-check", A_RESP, { id: "../../x y" })).status).toBe(400);
  });
});
