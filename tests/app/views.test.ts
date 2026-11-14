import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditTable } from "../../src/app/components/AuditTable";
import { MemoriesTable } from "../../src/app/components/MemoriesTable";
import { ProofScorecard } from "../../src/app/components/ProofScorecard";

const mem = (o: Record<string, unknown> = {}) => ({
  id: "m1", scope: "team-a", status: "active", version: 1, supersedes: null, derivedFrom: [], memoryType: "fix",
  claimKey: "svc:cache", text: "restart pool cp-0001", value: {}, appliesTo: {}, confidence: 0.9, source: "demo",
  createdBy: "u1", expiresAtMs: 2_000, expiresInMs: 1_000, ...o,
});

describe("views", () => {
  it("memories_table_shows_text_scope_status_and_remaining_ttl", () => {
    const html = renderToStaticMarkup(h(MemoriesTable, { memories: [mem()] as never }));
    expect(html).toContain("restart pool cp-0001");
    expect(html).toContain("team-a");
    expect(html).toContain("active");
    expect(html).toMatch(/expires in/i);
  });

  it("memories_table_marks_past_expiry_as_expired", () => {
    const html = renderToStaticMarkup(h(MemoriesTable, { memories: [mem({ expiresInMs: 0 })] as never }));
    expect(html).toMatch(/expired/i);
  });

  it("memories_table_escapes_memory_text_as_data", () => {
    const html = renderToStaticMarkup(h(MemoriesTable, { memories: [mem({ text: "<script>alert(1)</script>" })] as never }));
    expect(html).not.toContain("<script>");
  });

  it("memories_table_empty_state", () => {
    expect(renderToStaticMarkup(h(MemoriesTable, { memories: [] }))).toMatch(/no memories/i);
  });

  it("audit_table_shows_op_decision_and_reason_codes_only", () => {
    const ev = { _id: "a1", traceId: "tr1", tenantId: "t", actorId: "u1", op: "recall", decision: "allow", purpose: "incident-triage",
      reasonCodes: [], selectedIds: ["m1"], rejectedIds: [{ id: "m2", reason: "EXPIRED" }], queryHash: "h", createdAtMs: 1 };
    const html = renderToStaticMarkup(h(AuditTable, { events: [ev] as never }));
    expect(html).toContain("recall");
    expect(html).toContain("EXPIRED");
    expect(html).toContain("m2");
  });

  it("proof_scorecard_names_brain_counts_and_limits", () => {
    const arm = (s: number) => ({ n: 20, success: s, rate: s / 20, ci: [0.8, 1] as [number, number] });
    const report = { brain: "rule-brain", seeds: 20, arms: { R: arm(20), O: arm(0), P: arm(0), C: arm(20) },
      uplift: { rMinusP: 1, lower: 0.8, upper: 1 }, targetedResponse: 1, collateralStability: 1, harmfulAdoption: 0, harmfulTrials: 80,
      gates: { crossTenantLeaks: { count: 0, trials: 300 }, expiredUses: { count: 0, trials: 20 }, forgottenRecoveries: { count: 0, trials: 60 }, harmfulAdoption: { count: 0, trials: 80 }, traceCompleteness: { audited: 100, ops: 100 } },
      armTable: { seed: 1, rows: [] } };
    const html = renderToStaticMarkup(h(ProofScorecard, { report }));
    expect(html).toContain("rule-brain");
    expect(html).toContain("0 / 80");
    expect(html).toMatch(/plumbing and governance, not model behavior/i);
    expect(html).not.toMatch(/impossible|secure/i);
  });
});
