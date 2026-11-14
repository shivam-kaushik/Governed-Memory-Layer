import { describe, expect, it } from "vitest";
import type { Alert, Principal } from "../../src/contracts/contracts";
import { parseAlertMessage } from "../../src/app/chat";
import { A_RESP, B_RESP, apiWorld } from "./helpers";

type J = Record<string, any>;

describe("parseAlertMessage", () => {
  it("extracts_service_version_environment", () => {
    const a = parseAlertMessage("5xx spike on checkout-service 2.3.1 in staging after deploy")!;
    expect(a).toMatchObject({ service: "checkout-service", version: "2.3.1", environment: "staging" });
    expect(a.text).toBe("5xx spike on checkout-service 2.3.1 in staging after deploy");
  });
  it("environment_defaults_to_prod", () => {
    expect(parseAlertMessage("5xx spike on checkout-service v2.3.1")!.environment).toBe("prod");
  });
  it("returns_null_without_service_or_version", () => {
    expect(parseAlertMessage("something is broken")).toBeNull();
    expect(parseAlertMessage("5xx spike on checkout-service")).toBeNull();
    expect(parseAlertMessage("5xx spike on 2.3.1")).toBeNull();
  });
  it("same_message_gives_same_id_and_different_message_differs", () => {
    const m = "5xx spike on checkout-service 2.3.1";
    expect(parseAlertMessage(m)!.id).toBe(parseAlertMessage(m)!.id);
    expect(parseAlertMessage(m + " again")!.id).not.toBe(parseAlertMessage(m)!.id);
  });
});

describe("POST /api/chat", () => {
  const msg = "5xx spike on checkout-service 2.3.1 in prod after deploy";

  it("requires_a_session", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/chat", undefined, { message: msg })).status).toBe(401);
  });

  it("runs_triage_for_the_parsed_alert_as_the_session_principal", async () => {
    let seen: { p: Principal; token: string; alert: Alert } | undefined;
    const w = await apiWorld("valid_fix", 1, {
      runLive: async (p, token, alert) => {
        seen = { p, token, alert };
        return { action: { tool: "investigate" }, result: {}, traceId: "t1", traceComplete: true };
      },
    });
    const r = await w.call("POST", "/api/chat", B_RESP, { message: msg });
    expect(r.status).toBe(200);
    expect(seen!.token).toBe(B_RESP);
    expect(seen!.p.tenantId).toBe((await w.ctx.resolver(B_RESP) as Principal).tenantId);
    expect(seen!.alert).toMatchObject({ service: "checkout-service", version: "2.3.1", environment: "prod" });
    expect((r.json as J).traceId).toBe("t1");
  });

  it("forged_identity_fields_in_body_are_ignored", async () => {
    let seen: { p: Principal; alert: Alert } | undefined;
    const w = await apiWorld("valid_fix", 1, {
      runLive: async (p, _t, alert) => {
        seen = { p, alert };
        return { action: {}, result: {}, traceId: "t1", traceComplete: true };
      },
    });
    const A = (await w.ctx.resolver(A_RESP)) as Principal;
    await w.call("POST", "/api/chat", A_RESP, { message: msg, tenantId: "tenant-b", principal: { tenantId: "tenant-b", role: "admin" }, purpose: "x" });
    expect(seen!.p.tenantId).toBe(A.tenantId);
    expect(Object.keys(seen!.alert).sort()).toEqual(["environment", "id", "service", "symptom", "text", "version"]);
  });

  // Plan conflict flagged: free chat replaced the INVALID_ALERT rule on user request; see chat-free.test.ts.
  it("message_without_service_or_version_is_still_answered", async () => {
    const w = await apiWorld();
    expect((await w.call("POST", "/api/chat", A_RESP, { message: "hello there" })).status).toBe(200);
  });

  it("rejects_missing_empty_or_oversized_message", async () => {
    const w = await apiWorld();
    for (const body of [{}, { message: "" }, { message: "x".repeat(1001) }, { message: 5 }]) {
      expect((await w.call("POST", "/api/chat", A_RESP, body)).status).toBe(400);
    }
  });

  it("works_while_agent_loop_is_autonomous", async () => {
    const w = await apiWorld("valid_fix", 1, { manual: { get: () => false, set: () => undefined }, runLive: async () => ({ action: {}, result: {}, traceId: "t", traceComplete: true }) });
    expect((await w.call("POST", "/api/chat", A_RESP, { message: msg })).status).toBe(200);
  });
});
