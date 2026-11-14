import { describe, expect, it } from "vitest";
import { kpisFromMetrics, kpisFromProof, pushHistory } from "../../src/app/kpi-model";
import type { MonitorMetrics } from "../../src/contracts/contracts";

const m = (o: Partial<MonitorMetrics> = {}): MonitorMetrics => ({ windowMs: 1, recallsPerTenant: 3, recalls: 3, denies: 1, denyRate: 1 / 3, rejectedPerRecall: 2, actionsByType: { investigate: 2, restart_cache_pool: 1 }, abstainRate: 0.5, stepLatencyMs: { recall: { p50: 10, p95: 120 }, tool: { p50: 5, p95: 300 } }, ...o });

describe("kpi model (drives the 3D KPI scene)", () => {
  it("every_level_is_within_0_and_1", () => {
    for (const k of kpisFromMetrics(m({ recalls: 9999, denyRate: 5, rejectedPerRecall: 99 }), [])) {
      expect(k.level).toBeGreaterThanOrEqual(0);
      expect(k.level).toBeLessThanOrEqual(1);
    }
  });
  it("carries_the_sample_count_never_a_bare_rate", () => {
    const deny = kpisFromMetrics(m(), []).find((k) => k.id === "denies")!;
    expect(deny.value).toBe("33%");
    expect(deny.detail).toBe("1 / 3 recalls");
  });
  it("actions_sum_and_worst_p95_latency", () => {
    const ks = kpisFromMetrics(m(), []);
    expect(ks.find((k) => k.id === "actions")!.value).toBe("3");
    expect(ks.find((k) => k.id === "latency")!.value).toBe("300 ms");
  });
  it("no_metrics_means_no_kpis", () => expect(kpisFromMetrics(null, [])).toEqual([]));
  it("history_is_capped_and_feeds_points", () => {
    let h: number[][] = [];
    for (let i = 0; i < 40; i++) h = pushHistory(h, m({ recalls: i }));
    expect(h).toHaveLength(24);
    const k = kpisFromMetrics(m({ recalls: 39 }), h).find((x) => x.id === "recalls")!;
    expect(k.points).toHaveLength(24);
    expect(Math.max(...k.points)).toBeLessThanOrEqual(1);
  });
  it("proof_kpis_show_successes_over_trials", () => {
    const ks = kpisFromProof({ R: { success: 80, n: 80, rate: 1, ci: [0.95, 1] }, O: { success: 0, n: 80, rate: 0, ci: [0, 0.05] }, P: { success: 0, n: 80, rate: 0, ci: [0, 0.05] }, C: { success: 70, n: 80, rate: 0.875, ci: [0.8, 0.93] } });
    expect(ks.find((k) => k.id === "arm-R")!.detail).toBe("80 / 80 successes");
    expect(ks.find((k) => k.id === "arm-O")!.level).toBe(0);
  });
});
