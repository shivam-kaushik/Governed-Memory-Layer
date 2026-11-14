import { ruleBrain } from "../agent/brain-rules";
import { runTriage } from "../agent/triage-agent";
import { runProof, type ProofReport } from "../eval/run";
import { buildWorld } from "../eval/world";
import { FakeEvalStore } from "../fakes/fake-eval-store";
import { createApi } from "./api";
import type { ApiContext, ApiRequest, ApiResponse } from "./ports";

const PROOF_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const LABELS: Record<string, string> = {
  "tok-a-resp": "Team A responder",
  "tok-a-rev": "Team A reviewer",
  "tok-b-resp": "Team B responder",
};

export interface DemoServer {
  handle(req: ApiRequest): Promise<ApiResponse>;
  sessions: { token: string; label: string }[];
  demoMode: boolean;
}

// Fake-backed composition root. Swap to Person A's Mongo stores here at integration.
// Demo mode (GML_DEMO=1) is the only way the clock route and the session picker exist.
export async function buildDemoServer(env: Record<string, string | undefined> = process.env): Promise<DemoServer> {
  const demoMode = env["GML_DEMO"] === "1";
  const w = await buildWorld("valid_fix", 1);
  let proof: Promise<ProofReport> | undefined;
  const ctx: ApiContext = {
    resolver: w.deps.resolvePrincipal,
    layer: w.layer,
    reads: { listMemories: (p, scopes) => w.repo.listMemories(p, scopes), listAudit: (p, n) => w.audit.list(p, n) },
    trace: w.trace,
    evalStore: new FakeEvalStore(),
    clock: w.clock,
    alerts: [w.scenario.alert],
    runLive: async (principal, sessionToken, alert) => {
      const o = await runTriage(alert, { sessionToken, purpose: "incident-triage" }, w.layer, ruleBrain, w.trace, w.clock, {
        principal,
        simulator: w.simulator,
        newId: w.deps.newId,
      });
      return { action: o.action, result: o.result, traceId: o.traceId, traceComplete: o.traceComplete };
    },
    // Cached: the proof is deterministic, so one run serves every request.
    proofReport: () => (proof ??= runProof(PROOF_SEEDS, ruleBrain, { brainName: "rule-brain" })),
    demoMode,
  };
  const sessions = demoMode ? Object.entries(LABELS).map(([token, label]) => ({ token, label })) : [];
  return { handle: createApi(ctx), sessions, demoMode };
}

// One server per process, kept across dev hot reloads.
const g = globalThis as { __gml?: Promise<DemoServer> };
export const getServer = (): Promise<DemoServer> => (g.__gml ??= buildDemoServer());
