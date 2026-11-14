import { describe, expect, it } from "vitest";
import { createLlmBrain } from "../../src/agent/llm-brain";
import { makeScenario } from "../../src/agent/scenarios";
import type { EvidenceCard } from "../../src/contracts/contracts";
import { buildWorld } from "./helpers";

type Call = { url: string; init: RequestInit };
const scripted = (input: unknown, status = 200) => {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ content: [{ type: "tool_use", id: "tu_1", name: "choose_action", input }] }), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
};
const alert = makeScenario(1, "valid_fix").alert;
const card = (over: Partial<EvidenceCard> = {}): EvidenceCard => ({
  memoryId: "m1",
  version: 1,
  statement: "checkout-service 5xx spike after deploy: restart cache pool cp-abc123",
  value: { action: "restart_cache_pool", pool: "cp-abc123" },
  expiresAtMs: 2,
  confidence: 0.9,
  sourceAuthority: 0.8,
  score: 0.9,
  ...over,
});

describe("llm brain", () => {
  it("calls_messages_api_with_key_forced_tool_and_evidence_as_data", async () => {
    const s = scripted({ tool: "investigate", args: {}, usedMemoryIds: [], explanation: "no evidence" });
    const brain = createLlmBrain({ apiKey: "sk-test", model: "m-1", fetch: s.fetchFn });
    await brain.decideWithRationale(alert, [card()], []);
    expect(s.calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const h = s.calls[0]!.init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-test");
    const body = JSON.parse(String(s.calls[0]!.init.body));
    expect(body.model).toBe("m-1");
    expect(body.tool_choice).toEqual({ type: "tool", name: "choose_action" });
    expect(JSON.stringify(body)).toContain(alert.text);
    expect(JSON.stringify(body)).toContain("cp-abc123");
    expect(body.system).toMatch(/untrusted data/i);
  });

  it("returns_action_and_rationale_from_tool_use", async () => {
    const s = scripted({ tool: "restart_cache_pool", args: { pool: "cp-abc123" }, usedMemoryIds: ["m1"], explanation: "memory m1 matches" });
    const out = await createLlmBrain({ apiKey: "k", fetch: s.fetchFn }).decideWithRationale(alert, [card()], []);
    expect(out.action).toEqual({ tool: "restart_cache_pool", args: { pool: "cp-abc123" }, usedMemoryIds: ["m1"] });
    expect(out.rationale).toMatchObject({ rule: "llm_decision", evidenceIds: ["m1"], explanation: "memory m1 matches" });
  });

  it("tool_notes_reach_the_prompt", async () => {
    const s = scripted({ tool: "investigate", args: {}, usedMemoryIds: [] });
    await createLlmBrain({ apiKey: "k", fetch: s.fetchFn }).decideWithRationale(alert, [], ["pool cp-feed01 saturated"]);
    expect(String(s.calls[0]!.init.body)).toContain("cp-feed01");
  });

  it("api_error_throws_so_triage_falls_back_to_investigate", async () => {
    const s = scripted({}, 500);
    await expect(createLlmBrain({ apiKey: "k", fetch: s.fetchFn }).decideWithRationale(alert, [], [])).rejects.toThrow();
  });

  it("missing_tool_use_block_throws", async () => {
    const f = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(createLlmBrain({ apiKey: "k", fetch: f }).decideWithRationale(alert, [], [])).rejects.toThrow();
  });

  it("llm_choosing_unlisted_tool_is_blocked_by_the_guard_not_the_model", async () => {
    const w = await buildWorld("valid_fix");
    const s = scripted({ tool: "drop_database", args: {}, usedMemoryIds: [] });
    const o = await w.run(createLlmBrain({ apiKey: "k", fetch: s.fetchFn }));
    expect(o.result).toMatchObject({ executed: false, rejected: "TOOL_NOT_ALLOWED" });
  });

  it("llm_citing_unrecalled_memory_id_is_blocked", async () => {
    const w = await buildWorld("valid_fix");
    const s = scripted({ tool: "restart_cache_pool", args: { pool: "cp-000000" }, usedMemoryIds: ["not-in-evidence"] });
    const o = await w.run(createLlmBrain({ apiKey: "k", fetch: s.fetchFn }));
    expect(o.result).toMatchObject({ executed: false, rejected: "USED_IDS_INVALID" });
  });

  it("llm_explanation_is_returned_to_caller_but_never_stored_in_trace", async () => {
    const w = await buildWorld("valid_fix");
    const CANARY = "CANARY_EXPLANATION_TEXT";
    const s = scripted({ tool: "investigate", args: {}, usedMemoryIds: [], explanation: CANARY });
    const o = await w.run(createLlmBrain({ apiKey: "k", fetch: s.fetchFn }));
    expect(o.explanation).toBe(CANARY);
    expect(JSON.stringify(await w.trace.listByTrace(w.actor, o.traceId))).not.toContain(CANARY);
  });

  it("api_failure_in_triage_investigates_and_marks_brain_error", async () => {
    const w = await buildWorld("valid_fix");
    const s = scripted({}, 500);
    const o = await w.run(createLlmBrain({ apiKey: "k", fetch: s.fetchFn }));
    expect(o.action.tool).toBe("investigate");
    const ev = await w.trace.listByTrace(w.actor, o.traceId);
    expect(ev.find((e) => e.step === "brain_decision")!.payload.rationale).toMatchObject({ rule: "brain_error" });
  });
});
