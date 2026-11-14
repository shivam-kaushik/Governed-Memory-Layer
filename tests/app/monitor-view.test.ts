import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MonitorView } from "../../src/app/components/MonitorView";
import { explainStep, groupRuns } from "../../src/app/monitor-view";
import type { TraceEvent } from "../../src/contracts/contracts";

const ev = (traceId: string, step: TraceEvent["step"], payload: Record<string, unknown>, t: number): TraceEvent => ({
  _id: `${traceId}-${step}`, traceId, tenantId: "tenant-a", principalId: "a-resp", step, payload, createdAtMs: t,
});

describe("monitor view helpers", () => {
  it("groups_events_by_trace_newest_run_first", () => {
    const runs = groupRuns([ev("t1", "alert_received", {}, 1), ev("t2", "alert_received", {}, 5), ev("t1", "trace_closed", { outcome: "fixed" }, 3)]);
    expect(runs.map((r) => r.traceId)).toEqual(["t2", "t1"]);
    expect(runs[1]!.events).toHaveLength(2);
    expect(runs[1]!.outcome).toBe("fixed");
  });

  it("explains_each_decision_in_plain_words_from_ids_and_codes", () => {
    expect(explainStep(ev("t", "recall_result", { decision: "allow", selectedIds: ["m1", "m2"] }, 1))).toBe("Recall allow: 2 memories passed governance");
    expect(explainStep(ev("t", "recall_result", { decision: "deny", selectedIds: [] }, 1))).toBe("Recall deny: 0 memories passed governance");
    expect(explainStep(ev("t", "brain_decision", { tool: "restart_cache_pool", usedMemoryIds: ["m1"], rationale: { rule: "llm_decision" } }, 1))).toBe("Agent chose restart_cache_pool using memory m1");
    expect(explainStep(ev("t", "brain_decision", { tool: "investigate", usedMemoryIds: [] }, 1))).toBe("Agent chose investigate with no memory");
    expect(explainStep(ev("t", "tool_validation", { valid: false, reasons: ["TOOL_NOT_ALLOWED"] }, 1))).toBe("Guard BLOCKED: TOOL_NOT_ALLOWED");
    expect(explainStep(ev("t", "tool_executed", { tool: "restart_cache_pool", fixed: true }, 1))).toBe("Executed restart_cache_pool: incident fixed");
    expect(explainStep(ev("t", "memory_written", { memoryId: "m9", status: "active" }, 1))).toBe("Learned: wrote memory m9 (active)");
    expect(explainStep(ev("t", "memory_written", { skipped: true, reason: "ALREADY_KNOWN" }, 1))).toBe("No memory written (ALREADY_KNOWN)");
  });

  it("renders_runs_metrics_and_alert_banner_and_escapes_text", () => {
    const html = renderToStaticMarkup(
      createElement(MonitorView, {
        events: [ev("<script>x</script>", "alert_received", {}, 1)],
        metrics: { windowMs: 1, recallsPerTenant: 3, recalls: 3, denies: 1, denyRate: 1 / 3, rejectedPerRecall: 0, actionsByType: { investigate: 2 }, abstainRate: 1, stepLatencyMs: {} },
        alerts: [{ kind: "tool_guard_rejected", traceId: "t9", tenantId: "tenant-a", createdAtMs: 1, detail: "TOOL_NOT_ALLOWED" }],
      }),
    );
    expect(html).toContain("tool_guard_rejected");
    expect(html).toContain("Recalls");
    expect(html).not.toContain("<script>");
  });

  it("empty_state", () => {
    const html = renderToStaticMarkup(createElement(MonitorView, { events: [], metrics: null, alerts: [] }));
    expect(html).toContain("No runs yet");
  });
});
