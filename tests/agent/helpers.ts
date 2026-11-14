import { ruleBrain, type AgentBrain } from "../../src/agent/brain-rules";
import { makeScenario, type Scenario, type ScenarioKind } from "../../src/agent/scenarios";
import { seedScenario } from "../../src/agent/seed";
import { makeSimulator, type ToolSimulator } from "../../src/agent/tools";
import { runTriage } from "../../src/agent/triage-agent";
import type { Principal } from "../../src/contracts/contracts";
import type { CoreDeps } from "../../src/core/deps";
import { createMemoryLayer } from "../../src/core";
import { FakeAuditStore } from "../../src/fakes/fake-audit-store";
import { FakeClock } from "../../src/fakes/fake-clock";
import { FakeEmbedder } from "../../src/fakes/fake-embedder";
import { FakeMemoryRepo } from "../../src/fakes/fake-repo";
import { FakeTraceStore } from "../../src/fakes/fake-trace-store";

export const caller = (sessionToken: string) => ({ sessionToken, purpose: "incident-triage" });

// Everything a triage run needs, seeded from a scenario. Forget ids are applied by a reviewer.
export async function buildWorld(kind: ScenarioKind, seed = 1, trace: FakeTraceStore = new FakeTraceStore()) {
  const scenario: Scenario = makeScenario(seed, kind);
  const { teamAResponder, teamAReviewer, teamBResponder } = scenario.principals;
  const tokens: Record<string, Principal> = { "tok-a-resp": teamAResponder, "tok-a-rev": teamAReviewer, "tok-b-resp": teamBResponder };
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const repo = new FakeMemoryRepo();
  const clock = new FakeClock(scenario.nowMs);
  const audit = new FakeAuditStore();
  const embedder = new FakeEmbedder();
  const deps: CoreDeps = {
    resolvePrincipal: async (t) => tokens[t] ?? null,
    repo,
    embedder,
    clock,
    audit,
    newId,
    embeddingModel: "fake-hash",
    policyVersion: "v1",
  };
  const layer = createMemoryLayer(deps);
  await seedScenario(scenario, repo, embedder, "fake-hash");
  for (const id of scenario.forgetIds) await layer.forget(id, "test", caller("tok-a-rev"));

  const simulator: ToolSimulator = makeSimulator(scenario.nonce);
  const run = (brain: AgentBrain = ruleBrain, sim: ToolSimulator = simulator) =>
    runTriage(scenario.alert, caller("tok-a-resp"), layer, brain, trace, clock, { principal: scenario.actor, simulator: sim, newId });
  return { scenario, repo, clock, audit, trace, layer, simulator, deps, run, actor: scenario.actor };
}
