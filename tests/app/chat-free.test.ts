import { describe, expect, it } from "vitest";
import { parseChatMessage } from "../../src/app/chat";
import { A_RESP, B_RESP, apiWorld } from "./helpers";

type J = Record<string, any>;

describe("parseChatMessage", () => {
  it("uses_fields_stated_in_the_message", () => {
    const r = parseChatMessage("5xx on checkout-service 2.3.1 in staging");
    expect(r.alert).toMatchObject({ service: "checkout-service", version: "2.3.1", environment: "staging" });
    expect(r.inferred).toEqual({ service: false, version: false });
  });
  it("falls_back_to_chat_context_for_follow_ups", () => {
    const r = parseChatMessage("that did not help, try again", { service: "session-service", version: "3.2.1", environment: "prod" });
    expect(r.alert).toMatchObject({ service: "session-service", version: "3.2.1", environment: "prod", text: "that did not help, try again" });
    expect(r.inferred).toEqual({ service: true, version: true });
  });
  it("message_fields_beat_context", () => {
    const r = parseChatMessage("now it is billing-service 1.0.0", { service: "session-service", version: "3.2.1", environment: "prod" });
    expect(r.alert).toMatchObject({ service: "billing-service", version: "1.0.0" });
  });
  it("never_returns_null_and_marks_unknown_fields", () => {
    const r = parseChatMessage("hello there");
    expect(r.alert.service).toBe("unknown-service");
    expect(r.alert.version).toBe("0.0.0");
    expect(r.alert.environment).toBe("prod");
    expect(r.inferred).toEqual({ service: true, version: true });
  });
});

describe("POST /api/chat free text", () => {
  it("accepts_a_message_with_no_service_or_version", async () => {
    const w = await apiWorld();
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "hello there" });
    expect(r.status).toBe(200);
  });
  it("context_is_validated_and_carries_service_forward", async () => {
    let seen: any;
    const w = await apiWorld("valid_fix", 1, { runLive: async (_p, _t, alert) => ((seen = alert), { action: {}, result: {}, traceId: "t", traceComplete: true }) });
    await w.call("POST", "/api/chat", A_RESP, { message: "try again", context: { service: "session-service", version: "3.2.1", environment: "prod" } });
    expect(seen).toMatchObject({ service: "session-service", version: "3.2.1" });
    expect((await w.call("POST", "/api/chat", A_RESP, { message: "x", context: { service: 5 } })).status).toBe(400);
  });
});

describe("chat reply timeline", () => {
  it("steps_follow_the_trace_in_order_with_recall_rejections", async () => {
    const w = await apiWorld("valid_fix", 1);
    const alert = w.scenario.alert;
    const r = await w.call("POST", "/api/chat", A_RESP, { message: alert.text });
    const steps = (r.json as J).steps as { kind: string }[];
    expect(steps.map((s) => s.kind)).toEqual(["understood", "recall", "decision", "guard", "tool", "memory"]);
    expect(steps.find((s) => s.kind === "recall")).toHaveProperty("rejected");
  });
  it("steps_never_contain_raw_memory_text", async () => {
    const w = await apiWorld("valid_fix", 1);
    const r = await w.call("POST", "/api/chat", A_RESP, { message: w.scenario.alert.text });
    const mems = (await w.repo.listMemories((await w.ctx.resolver(A_RESP)) as any, ["team:" + ((await w.ctx.resolver(A_RESP)) as any).tenantId])) as { text: string }[];
    const blob = JSON.stringify((r.json as J).steps);
    for (const m of mems) if (m.text) expect(blob).not.toContain(m.text);
  });
  it("another_tenant_cannot_read_a_steps_trace", async () => {
    const w = await apiWorld("valid_fix", 1);
    const a = await w.call("POST", "/api/chat", A_RESP, { message: w.scenario.alert.text });
    const traceId = (a.json as J).traceId as string;
    const b = await w.call("POST", "/api/chat", B_RESP, { message: w.scenario.alert.text });
    expect(JSON.stringify((b.json as J).steps)).not.toContain(traceId);
  });
});
