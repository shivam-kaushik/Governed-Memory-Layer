import { describe, expect, it } from "vitest";
import type { TraceStore } from "../../src/contracts/contracts";
import { A_RESP, A_REV, B_RESP, apiWorld } from "./helpers";

const DAY = 86_400_000;
type J = Record<string, any>;
const json = (r: { json: unknown }) => r.json as J;

describe("api identity", () => {
  it("rejects_request_without_session_token", async () => {
    const w = await apiWorld();
    for (const [m, p] of [["GET", "/api/memories"], ["GET", "/api/audit"], ["GET", "/api/proof"], ["POST", "/api/live/run"]] as const) {
      expect((await w.call(m, p)).status).toBe(401);
    }
  });

  it("rejects_unknown_session_token", async () => {
    const w = await apiWorld();
    expect((await w.call("GET", "/api/memories", "tok-nobody")).status).toBe(401);
  });

  it("identity_comes_from_session_not_body_or_query", async () => {
    const w = await apiWorld();
    const r = await w.call("GET", "/api/memories", B_RESP, { tenantId: "tenant-a", principal: { tenantId: "tenant-a" } }, { tenantId: "tenant-a", scopeId: "team:tenant-a" });
    expect(r.status).toBe(200);
    expect(json(r).memories).toEqual([]); // team B sees none of team A's memories
  });

  it("purpose_is_fixed_server_side_and_not_read_from_request", async () => {
    const w = await apiWorld();
    const r = await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id, purpose: "marketing" });
    expect(r.status).toBe(200);
    expect(w.audit.events.every((e) => e.purpose === "incident-triage")).toBe(true);
  });
});

describe("api memories", () => {
  it("lists_team_memory_with_status_scope_version_and_expiry_countdown", async () => {
    const w = await apiWorld();
    const r = await w.call("GET", "/api/memories", A_RESP);
    const m = json(r).memories[0];
    expect(m).toMatchObject({ id: w.scenario.memoriesToSeed[0]!._id, status: "active", scope: "team:tenant-a", version: 1 });
    expect(m.expiresInMs).toBe(7 * DAY);
  });

  it("memory_view_omits_embedding_hash_and_tenant_fields", async () => {
    const w = await apiWorld();
    const m = json(await w.call("GET", "/api/memories", A_RESP)).memories[0];
    for (const k of ["embedding", "contentHash", "tenantId", "embeddingModel"]) expect(m).not.toHaveProperty(k);
  });

  it("other_tenant_memory_is_never_listed", async () => {
    const w = await apiWorld("other_tenant");
    expect(json(await w.call("GET", "/api/memories", A_RESP)).memories).toEqual([]);
    expect(json(await w.call("GET", "/api/memories", B_RESP)).memories).toHaveLength(1);
  });

  it("other_principals_private_memory_is_never_listed", async () => {
    const w = await apiWorld();
    await w.layer.remember(
      {
        memoryType: "preference",
        claimKey: "pref/mine",
        text: "private note",
        value: {},
        appliesTo: { service: "checkout-service", versionRange: ">=1.0.0", environment: "prod" },
        scope: "private",
        ttlMs: DAY,
        confidence: 0.5,
        source: { type: "manual", ref: "x" },
      },
      { sessionToken: A_RESP, purpose: "incident-triage" },
    );
    const mine = json(await w.call("GET", "/api/memories", A_RESP)).memories;
    const theirs = json(await w.call("GET", "/api/memories", A_REV)).memories;
    expect(mine.some((m: J) => m.scope === "private:a-resp")).toBe(true);
    expect(theirs.some((m: J) => m.scope === "private:a-resp")).toBe(false);
  });

  it("forged_body_fields_ignored_on_correct", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const r = await w.call("POST", "/api/memories/correct", A_REV, {
      id,
      reason: "wrong pool",
      text: "checkout-service 5xx: restart cache pool cp-ffffff",
      value: { action: "restart_cache_pool", pool: "cp-ffffff" },
      tenantId: "tenant-b",
      scopeId: "team:tenant-b",
      role: "admin",
      createdBy: "someone-else",
      status: "active",
    });
    expect(r.status).toBe(200);
    const mems = await w.repo.listMemories(w.scenario.principals.teamAReviewer, ["team:tenant-a"]);
    const fresh = mems.find((m) => m._id === json(r).newId)!;
    expect(fresh.tenantId).toBe("tenant-a");
    expect(fresh.scopeId).toBe("team:tenant-a");
    expect(fresh.createdBy).toBe("a-rev");
  });

  it("correct_via_api_supersedes_and_shows_version_chain", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const r = await w.call("POST", "/api/memories/correct", A_REV, { id, reason: "pool changed", value: { action: "restart_cache_pool", pool: "cp-abcdef" } });
    expect(r.status).toBe(200);
    const list = json(await w.call("GET", "/api/memories", A_REV)).memories as J[];
    expect(list.find((m) => m.id === id)!.status).toBe("superseded");
    expect(list.find((m) => m.id === json(r).newId)).toMatchObject({ version: 2, supersedes: id, status: "active" });
  });

  it("forget_via_api_removes_memory_and_blocks_recall", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const r = await w.call("POST", "/api/memories/forget", A_REV, { id, reason: "bad fix" });
    expect(r.status).toBe(200);
    expect(json(r).tombstoneId).toBeTruthy();
    const run = await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    expect(json(run).action.tool).toBe("investigate");
  });

  it("responder_cannot_forget_or_correct_team_memory", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const f = await w.call("POST", "/api/memories/forget", A_RESP, { id, reason: "x" });
    const c = await w.call("POST", "/api/memories/correct", A_RESP, { id, reason: "x", text: "y" });
    expect(f.status).toBe(403);
    expect(c.status).toBe(403);
    expect(json(f).error).toMatch(/DENIED/);
  });

  it("other_tenant_cannot_forget_or_correct_foreign_memory", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    expect((await w.call("POST", "/api/memories/forget", B_RESP, { id, reason: "x" })).status).toBe(403);
    expect((await w.repo.getById(w.scenario.actor, id))?.status).toBe("active");
  });

  it("malformed_body_is_400_and_never_reaches_the_layer", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/memories/forget", A_REV, { id: 42 })).status).toBe(400);
    expect((await w.call("POST", "/api/memories/forget", A_REV, { id: "*", reason: "x" })).status).toBe(400);
    expect((await w.call("POST", "/api/memories/forget", A_REV, "not json")).status).toBe(400);
    expect(w.audit.events.filter((e) => e.op === "forget")).toHaveLength(0);
  });

  it("error_responses_carry_code_and_trace_id_but_no_memory_text", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const r = await w.call("POST", "/api/memories/forget", A_RESP, { id, reason: "x" });
    expect(Object.keys(json(r)).sort()).toEqual(["error", "traceId"]);
    expect(JSON.stringify(r.json)).not.toContain(w.scenario.nonce);
  });

  it("unexpected_failure_is_500_without_internal_message", async () => {
    const w = await apiWorld();
    w.audit.setFailing(true);
    const r = await w.call("POST", "/api/memories/forget", A_REV, { id: w.scenario.memoriesToSeed[0]!._id, reason: "x" });
    expect(r.status).toBe(500);
    expect(json(r)).toEqual({ error: "INTERNAL" });
  });
});

describe("api audit", () => {
  it("audit_lists_decisions_with_selected_and_rejected_reason_codes", async () => {
    const w = await apiWorld("expired_fix");
    w.repo.setIndexLag(true); // stale index: the expired doc reaches the authoritative recheck
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const ev = json(await w.call("GET", "/api/audit", A_RESP)).events as J[];
    const recall = ev.find((e) => e.op === "recall")!;
    expect(recall.rejectedIds[0].reason).toBe("EXPIRED");
  });

  it("audit_is_tenant_isolated", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    expect(json(await w.call("GET", "/api/audit", B_RESP)).events).toEqual([]);
  });

  it("responder_sees_only_own_audit_rows_reviewer_sees_tenant", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    await w.layer.recall({ text: "x", service: "checkout-service", version: "2.3.1", environment: "prod" }, { sessionToken: A_REV, purpose: "incident-triage" });
    const own = json(await w.call("GET", "/api/audit", A_RESP)).events as J[];
    const all = json(await w.call("GET", "/api/audit", A_REV)).events as J[];
    expect(own.every((e) => e.actorId === "a-resp")).toBe(true);
    expect(all.some((e) => e.actorId === "a-rev")).toBe(true);
  });

  it("audit_payload_has_no_raw_memory_text", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const body = JSON.stringify(json(await w.call("GET", "/api/audit", A_REV)));
    expect(body).not.toContain(w.scenario.nonce);
  });
});

describe("api traces", () => {
  it("trace_events_readable_by_same_tenant", async () => {
    const w = await apiWorld();
    const run = json(await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id }));
    const r = await w.call("GET", `/api/traces/${run.traceId}`, A_RESP);
    expect(r.status).toBe(200);
    expect((json(r).events as J[])[0]!.step).toBe("alert_received");
  });

  it("trace_is_tenant_isolated_foreign_trace_is_404", async () => {
    const w = await apiWorld();
    const run = json(await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id }));
    expect((await w.call("GET", `/api/traces/${run.traceId}`, B_RESP)).status).toBe(404);
  });

  it("trace_has_no_update_or_delete_route", async () => {
    const w = await apiWorld();
    const run = json(await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id }));
    for (const m of ["PUT", "PATCH", "DELETE", "POST"]) expect((await w.call(m, `/api/traces/${run.traceId}`, A_RESP)).status).toBe(405);
  });
});

describe("api live", () => {
  it("lists_alerts", async () => {
    const w = await apiWorld();
    expect(json(await w.call("GET", "/api/live/alerts", A_RESP)).alerts[0].id).toBe(w.scenario.alert.id);
  });

  it("live_run_uses_session_principal_and_returns_action_and_trace_id", async () => {
    const w = await apiWorld();
    const r = await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    expect(r.status).toBe(200);
    expect(json(r).action).toMatchObject({ tool: "restart_cache_pool", args: { pool: w.scenario.nonce } });
    expect(json(r).traceComplete).toBe(true);
  });

  it("live_run_as_other_tenant_investigates_and_trace_is_theirs", async () => {
    const w = await apiWorld();
    const r = await w.call("POST", "/api/live/run", B_RESP, { alertId: w.scenario.alert.id });
    expect(json(r).action.tool).toBe("investigate");
    const ev = await w.trace.listByTrace(w.scenario.principals.teamBResponder, json(r).traceId);
    expect(ev.every((e) => e.tenantId === "tenant-b")).toBe(true);
  });

  it("unknown_alert_is_404", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/live/run", A_RESP, { alertId: "nope" })).status).toBe(404);
  });

  it("clock_advance_day_moves_clock_by_one_day", async () => {
    const w = await apiWorld();
    const before = w.clock.nowMs();
    const r = await w.call("POST", "/api/live/clock", A_RESP, { op: "advance_day" });
    expect(json(r).nowMs).toBe(before + DAY);
    expect(w.clock.nowMs()).toBe(before + DAY);
  });

  it("clock_jump_to_expiry_lands_exactly_on_expiry_and_run_then_investigates", async () => {
    const w = await apiWorld();
    const exp = w.scenario.memoriesToSeed[0]!.expiresAtMs;
    const r = await w.call("POST", "/api/live/clock", A_RESP, { op: "jump_to_expiry" });
    expect(json(r).nowMs).toBe(exp);
    const run = await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    expect(json(run).action.tool).toBe("investigate");
  });

  it("clock_jump_with_nothing_to_expire_is_409", async () => {
    const w = await apiWorld("no_precedent");
    expect((await w.call("POST", "/api/live/clock", A_RESP, { op: "jump_to_expiry" })).status).toBe(409);
  });

  it("clock_controls_are_404_outside_demo_mode", async () => {
    const w = await apiWorld("valid_fix", 1, { demoMode: false });
    expect((await w.call("POST", "/api/live/clock", A_RESP, { op: "advance_day" })).status).toBe(404);
  });

  it("clock_rejects_unknown_op", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/live/clock", A_RESP, { op: "set", nowMs: 0 })).status).toBe(400);
  });
});

describe("api proof and routing", () => {
  it("proof_returns_report_to_authenticated_session_only", async () => {
    const w = await apiWorld();
    expect(json(await w.call("GET", "/api/proof", A_RESP)).report.brain).toBe("rule-brain");
    expect((await w.call("GET", "/api/proof")).status).toBe(401);
  });

  it("unknown_route_is_404_and_wrong_method_is_405", async () => {
    const w = await apiWorld();
    expect((await w.call("GET", "/api/nope", A_RESP)).status).toBe(404);
    expect((await w.call("DELETE", "/api/memories", A_RESP)).status).toBe(405);
  });

  it("token_may_come_from_session_cookie", async () => {
    const w = await apiWorld();
    const r = await w.raw({ method: "GET", path: "/api/memories", headers: { cookie: `theme=dark; session=${A_RESP}` } });
    expect(r.status).toBe(200);
    expect(json(r).memories).toHaveLength(1);
  });
});

describe("api defense in depth (stores that leak)", () => {
  it("purpose_in_body_cannot_change_the_purpose_used_by_correct_and_forget", async () => {
    const w = await apiWorld();
    const id = w.scenario.memoriesToSeed[0]!._id;
    const r = await w.call("POST", "/api/memories/forget", A_REV, { id, reason: "x", purpose: "marketing" });
    expect(r.status).toBe(200);
    expect(w.audit.events.filter((e) => e.op === "forget").every((e) => e.purpose === "incident-triage")).toBe(true);
  });

  it("memories_filter_drops_rows_a_leaky_store_returns_from_other_tenants_and_scopes", async () => {
    const w = await apiWorld("other_tenant");
    const everything = async () => [...(await w.repo.listMemories(w.scenario.principals.teamBResponder, ["team:tenant-b"]))];
    const leaky = await apiWorld("other_tenant", 1, { reads: { listMemories: everything, listAudit: async () => [] } });
    expect(json(await leaky.call("GET", "/api/memories", A_RESP)).memories).toEqual([]);
  });

  it("audit_filter_drops_rows_a_leaky_store_returns_from_other_tenants", async () => {
    const w = await apiWorld();
    await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id });
    const all = async () => [...w.audit.events];
    const bRev = { id: "b-rev", tenantId: "tenant-b", role: "reviewer", scopes: ["team:tenant-b", "private:b-rev"], purposes: ["incident-triage"] };
    const leaky = { ...w.ctx, resolver: async () => bRev, reads: { ...w.ctx.reads, listAudit: all } }; // reviewer: no own-rows filter masks the tenant filter
    const { createApi } = await import("../../src/app/api");
    const r = await createApi(leaky)({ method: "GET", path: "/api/audit", headers: { authorization: "Bearer any" } });
    expect(json(r).events).toEqual([]);
  });

  it("trace_filter_drops_events_a_leaky_store_returns_from_other_tenants", async () => {
    const w = await apiWorld();
    const run = json(await w.call("POST", "/api/live/run", A_RESP, { alertId: w.scenario.alert.id }));
    const all = await w.trace.listByTrace(w.scenario.actor, run.traceId);
    const leaky = { ...w.ctx, trace: Object.create(w.trace, { listByTrace: { value: async () => all } }) as TraceStore };
    const { createApi } = await import("../../src/app/api");
    const r = await createApi(leaky)({ method: "GET", path: `/api/traces/${run.traceId}`, headers: { authorization: `Bearer ${B_RESP}` } });
    expect(r.status).toBe(404);
  });

  it("principal_without_the_dashboard_purpose_sees_no_memories", async () => {
    const w = await apiWorld();
    const odd = { ...w.scenario.actor, purposes: ["marketing"] };
    const r = await apiWorld("valid_fix", 1, { resolver: async () => odd });
    expect(json(await r.call("GET", "/api/memories", "anything")).memories).toEqual([]);
  });
});
