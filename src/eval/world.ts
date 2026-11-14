import type { AgentBrain } from "../agent/brain-rules";
import { makeScenario, type Scenario, type ScenarioKind } from "../agent/scenarios";
import { seedScenario } from "../agent/seed";
import { makeSimulator } from "../agent/tools";
import { runTriage } from "../agent/triage-agent";
import type { Principal } from "../contracts/contracts";
import { createMemoryLayer } from "../core";
import type { CoreDeps } from "../core/deps";
import { FakeAuditStore } from "../fakes/fake-audit-store";
import { FakeClock } from "../fakes/fake-clock";
import { FakeEmbedder } from "../fakes/fake-embedder";
import { FakeMemoryRepo } from "../fakes/fake-repo";
import { FakeTraceStore } from "../fakes/fake-trace-store";

export const caller = (sessionToken: string) => ({ sessionToken, purpose: "incident-triage" });

// One seeded in-memory world per (scenario kind, seed): same alert, principal, clock and memories every time.
export async function buildWorld(kind: ScenarioKind, seed: number) {
  const scenario: Scenario = makeScenario(seed, kind);
  const { teamAResponder, teamAReviewer, teamBResponder } = scenario.principals;
  const tokens: Record<string, Principal> = { "tok-a-resp": teamAResponder, "tok-a-rev": teamAReviewer, "tok-b-resp": teamBResponder };
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const repo = new FakeMemoryRepo();
  const embedder = new FakeEmbedder();
  const deps: CoreDeps = {
    resolvePrincipal: async (t) => tokens[t] ?? null,
    repo,
    embedder,
    clock: new FakeClock(scenario.nowMs),
    audit: new FakeAuditStore(),
    newId,
    embeddingModel: "fake-hash",
    policyVersion: "v1",
  };
  const layer = createMemoryLayer(deps);
  await seedScenario(scenario, repo, embedder, "fake-hash");
  for (const id of scenario.forgetIds) await layer.forget(id, "proof setup", caller("tok-a-rev"));

  const trace = new FakeTraceStore();
  const simulator = makeSimulator(scenario.nonce);
  const run = (brain: AgentBrain) =>
    runTriage(scenario.alert, caller("tok-a-resp"), layer, brain, trace, deps.clock, { principal: scenario.actor, simulator, newId });
  return { scenario, layer, run, repo, audit: deps.audit as FakeAuditStore, trace, clock: deps.clock, deps, simulator };
}
