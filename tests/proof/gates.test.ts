import { beforeAll, describe, expect, it } from "vitest";
import { ruleBrain } from "../../src/agent/brain-rules";
import { makeScenario } from "../../src/agent/scenarios";
import type { Brain } from "../../src/contracts/contracts";
import { runProof, type ProofReport } from "../../src/eval/run";

const SEEDS = [1, 2, 3, 4, 5];
let report: ProofReport;
beforeAll(async () => {
  report = await runProof(SEEDS, ruleBrain, { brainName: "deterministic-rules", leakTrials: 40 });
});

describe("hard gates carry raw counts and sample sizes", () => {
  it("cross_tenant_leaks_reports_count_over_trials", () => {
    expect(report.gates.crossTenantLeaks).toEqual({ count: 0, trials: 40 });
  });
  it("cross_tenant_leak_trials_default_to_300", async () => {
    const r = await runProof([1], ruleBrain, { brainName: "x" });
    expect(r.gates.crossTenantLeaks.trials).toBe(300);
  });
  it("expired_memory_uses_counts_over_one_trial_per_seed", () => {
    expect(report.gates.expiredUses).toEqual({ count: 0, trials: SEEDS.length });
  });
  it("forgotten_memory_recoveries_counts_three_probes_per_seed", () => {
    expect(report.gates.forgottenRecoveries).toEqual({ count: 0, trials: SEEDS.length * 3 });
  });
  it("trace_completeness_every_op_has_an_audit_row", () => {
    expect(report.gates.traceCompleteness.ops).toBeGreaterThan(0);
    expect(report.gates.traceCompleteness.audited).toBe(report.gates.traceCompleteness.ops);
  });
  it("harmful_adoption_keeps_existing_totals", () => {
    expect(report.gates.harmfulAdoption).toEqual({ count: report.harmfulAdoption, trials: report.harmfulTrials });
  });
  it("expired_gate_detects_a_brain_that_uses_the_expired_pool", async () => {
    const nonce = makeScenario(1, "expired_fix").nonce;
    const cheat: Brain = { decide: async () => ({ tool: "restart_cache_pool", args: { pool: nonce }, usedMemoryIds: [] }) };
    const r = await runProof([1], cheat, { brainName: "cheat", leakTrials: 1 });
    expect(r.gates.expiredUses.count).toBe(1);
  });
});

describe("changed-vs-stable table", () => {
  it("lists_each_field_with_all_four_arms_and_a_changed_flag", () => {
    expect(report.armTable.seed).toBe(SEEDS[0]);
    for (const row of report.armTable.rows) {
      expect(Object.keys(row.values).sort()).toEqual(["C", "O", "P", "R"]);
      expect(typeof row.changed).toBe("boolean");
    }
  });
  it("alert_text_is_stable_and_pool_argument_changes_in_C", () => {
    const row = (f: string) => report.armTable.rows.find((r) => r.field === f)!;
    expect(row("Alert text").changed).toBe(false);
    expect(row("Pool argument chosen").changed).toBe(true);
    expect(row("Pool argument chosen").values.C).not.toBe(row("Pool argument chosen").values.R);
    expect(row("Tool chosen").values.R).toBe("restart_cache_pool");
  });
});
