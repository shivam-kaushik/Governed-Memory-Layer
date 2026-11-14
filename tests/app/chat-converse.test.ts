import { describe, expect, it } from "vitest";
import type { ChatBrain } from "../../src/agent/chat-brain";
import { A_RESP, apiWorld } from "./helpers";

type J = Record<string, any>;
const brain = (over: Partial<ChatBrain>): ChatBrain => ({
  name: "stub",
  route: async () => ({ intent: "small_talk", reply: "Hello!" }),
  answer: async () => ({ text: "answer", usedMemoryIds: [] }),
  ...over,
});
const runLive = (log: unknown[] = []) => async (_p: unknown, _t: string, alert: unknown) => (log.push(alert), { action: { tool: "investigate", args: {}, usedMemoryIds: [] }, result: { executed: true, fixed: false }, traceId: "t1", traceComplete: true, turns: [] });

describe("conversational chat", () => {
  it("small_talk_gets_a_reply_without_running_the_agent_or_touching_memory", async () => {
    const log: unknown[] = [];
    const w = await apiWorld("valid_fix", 1, { chat: brain({}), runLive: runLive(log) as never });
    const before = (await w.audit.list((await w.ctx.resolver(A_RESP)) as never, 100)).length;
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "hi" });
    expect(r.status).toBe(200);
    expect((r.json as J).kind).toBe("chat");
    expect((r.json as J).text).toBe("Hello!");
    expect(log).toEqual([]);
    expect((await w.audit.list((await w.ctx.resolver(A_RESP)) as never, 100)).length).toBe(before);
    expect(((r.json as J).steps as { kind: string }[]).map((s) => s.kind)).toEqual(["understood", "answer"]);
  });

  it("an_incident_runs_the_governed_triage_with_fields_from_the_router", async () => {
    const log: any[] = [];
    const w = await apiWorld("valid_fix", 1, { chat: brain({ route: async () => ({ intent: "incident", service: "session-service", version: "3.2.1" }) }), runLive: runLive(log) as never });
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "sessions are failing" });
    expect(log[0]).toMatchObject({ service: "session-service", version: "3.2.1", environment: "prod" });
    expect((r.json as J).kind).toBe("incident");
  });

  it("a_memory_question_recalls_through_the_governed_layer_and_answers_from_the_cards", async () => {
    const w = await apiWorld("valid_fix", 1);
    const a = w.scenario.alert;
    let seen: string[] = [];
    const chat = brain({
      route: async () => ({ intent: "memory_question", service: a.service, version: a.version, environment: a.environment }),
      answer: async (_m, cards) => ((seen = cards.map((c) => c.memoryId)), { text: "Restart the pool.", usedMemoryIds: [...cards.map((c) => c.memoryId), "forged-id"] }),
    });
    const w2 = { ...w, ctx: { ...w.ctx, chat } };
    const call = (await apiWorld("valid_fix", 1, { chat })).call;
    const r = await call("POST", "/api/chat", A_RESP, { message: "what worked last time?" });
    const j = r.json as J;
    expect(j.kind).toBe("chat");
    expect(j.text).toBe("Restart the pool.");
    expect(seen.length).toBe(1);
    expect(j.usedMemoryIds).toEqual(seen); // forged id from the model is dropped
    expect(j.steps.map((s: any) => s.kind)).toEqual(["understood", "recall", "answer"]);
    expect(w2).toBeDefined();
  });

  it("a_memory_question_without_a_service_asks_instead_of_guessing", async () => {
    let recalled = 0;
    const w = await apiWorld("valid_fix", 1, { chat: brain({ route: async () => ({ intent: "memory_question" }) }) });
    const orig = w.ctx.layer.recall;
    w.ctx.layer.recall = async (...a) => (recalled++, orig(...a));
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "what do you remember?" });
    expect(recalled).toBe(0);
    expect((r.json as J).kind).toBe("chat");
    expect((r.json as J).text).toMatch(/which service/i);
  });

  it("falls_back_to_the_rule_router_when_the_model_router_fails_so_hi_is_still_small_talk", async () => {
    const log: unknown[] = [];
    const w = await apiWorld("valid_fix", 1, { chat: brain({ route: async () => { throw new Error("llm http 500"); } }), runLive: runLive(log) as never });
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "hi" });
    expect((r.json as J).kind).toBe("chat");
    expect(log).toEqual([]);
  });

  it("garbage_router_output_is_ignored_in_favor_of_the_rule_router", async () => {
    const log: unknown[] = [];
    const w = await apiWorld("valid_fix", 1, { chat: brain({ route: async () => ({ intent: "run_shell" }) as never }), runLive: runLive(log) as never });
    const r = await w.call("POST", "/api/chat", A_RESP, { message: "thanks" });
    expect((r.json as J).kind).toBe("chat");
    expect(log).toEqual([]);
  });

  it("history_is_validated_and_bounded", async () => {
    const w = await apiWorld("valid_fix", 1, { chat: brain({}) });
    const long = Array.from({ length: 9 }, () => ({ from: "you", text: "x" }));
    expect((await w.call("POST", "/api/chat", A_RESP, { message: "hi", history: long })).status).toBe(400);
    expect((await w.call("POST", "/api/chat", A_RESP, { message: "hi", history: [{ from: "root", text: "x" }] })).status).toBe(400);
    expect((await w.call("POST", "/api/chat", A_RESP, { message: "hi", history: [{ from: "you", text: "hi" }] })).status).toBe(200);
  });
});
