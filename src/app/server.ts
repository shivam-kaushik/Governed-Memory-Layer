import { ruleBrain, type AgentBrain } from "../agent/brain-rules";
import { runEpisode } from "../agent/episode";
import { createLlmBrain, DEFAULT_MODEL } from "../agent/llm-brain";
import { SCENARIO_KINDS, type ScenarioKind } from "../agent/scenarios";
import { withFindings } from "../agent/tools";
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
export async function buildDemoServer(
  env: Record<string, string | undefined> = process.env,
  opts: { fetch?: typeof fetch } = {},
): Promise<DemoServer> {
  const demoMode = env["GML_DEMO"] === "1";
  // GML_WORLD=no_precedent starts with empty memory so the agent has to learn.
  const kind = SCENARIO_KINDS.find((k) => k === env["GML_WORLD"]) ?? ("valid_fix" as ScenarioKind);
  const w = await buildWorld(kind, 1);
  // The model is used only when a key is configured; the label always says which brain decided.
  const apiKey = env["ANTHROPIC_API_KEY"];
  const model = env["GML_MODEL"] ?? DEFAULT_MODEL;
  const brain: AgentBrain = apiKey ? createLlmBrain({ apiKey, model, ...(opts.fetch ? { fetch: opts.fetch } : {}) }) : ruleBrain;
  const brainName = apiKey ? `llm:${model}` : "rule-brain";
  const simulator = withFindings(w.simulator, w.scenario.nonce);
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
      const e = await runEpisode(alert, { sessionToken, purpose: "incident-triage" }, w.layer, brain, w.trace, w.clock, {
        principal,
        simulator,
        newId: w.deps.newId,
      });
      const last = e.turns[e.turns.length - 1]!;
      return { action: last.action, result: last.result, traceId: last.traceId, traceComplete: last.traceComplete, brain: brainName, fixed: e.fixed, turns: e.turns };
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
