import { describe, expect, it } from "vitest";
import { makeSimulator, withFindings } from "../../src/agent/tools";

const act = (tool: string, args: Record<string, string | number>) => ({ tool: tool as never, args, usedMemoryIds: [] });

describe("simulator fix kinds beyond the cache pool", () => {
  it("rollback_fixes_only_the_true_version", () => {
    const sim = makeSimulator("cp-1", { rollbackVersion: "2.3.8" });
    expect(sim.run(act("rollback_deploy", { version: "2.3.8" })).fixed).toBe(true);
    expect(sim.run(act("rollback_deploy", { version: "2.3.5" })).fixed).toBe(false);
  });
  it("scale_fixes_only_at_or_above_the_needed_replicas", () => {
    const sim = makeSimulator("cp-1", { minReplicas: 8 });
    expect(sim.run(act("scale_service", { replicas: 8 })).fixed).toBe(true);
    expect(sim.run(act("scale_service", { replicas: 4 })).fixed).toBe(false);
  });
  it("without_extras_behaviour_is_unchanged", () => {
    const sim = makeSimulator("cp-1");
    expect(sim.run(act("rollback_deploy", { version: "2.3.8" })).fixed).toBe(false);
    expect(sim.run(act("scale_service", { replicas: 50 })).fixed).toBe(false);
    expect(sim.run(act("restart_cache_pool", { pool: "cp-1" })).fixed).toBe(true);
  });
  it("findings_text_can_be_overridden_and_default_is_unchanged", () => {
    expect(withFindings(makeSimulator("cp-1"), "cp-1").run(act("investigate", {})).findings).toContain("cp-1");
    expect(withFindings(makeSimulator("cp-1"), "cp-1", "Deploy 2.4.0 coincides with the first errors.").run(act("investigate", {})).findings).toBe("Deploy 2.4.0 coincides with the first errors.");
  });
});
