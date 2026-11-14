import { randomUUID } from "node:crypto";
import { ruleBrain, type AgentBrain } from "../agent/brain-rules";
import { runEpisode } from "../agent/episode";
import { createLlmBrain, DEFAULT_MODEL } from "../agent/llm-brain";
import { makeSimulator, withFindings } from "../agent/tools";
import { EMBEDDING_MODEL } from "../contracts/contracts";
import { createMemoryLayer } from "../core";
import { sha256 } from "../core/audit";
import type { CoreDeps } from "../core/deps";
import { voyageFromEnv } from "../core/voyage";
import { runProof } from "../eval/run";
import { getDb } from "../db/client";
import { createEmbedder } from "../db/embedder";
import { MongoAuditStore } from "../db/mongo-audit-store";
import { MongoEvalStore } from "../db/mongo-eval-store";
import { MongoMemoryRepo } from "../db/mongo-memory-repo";
import { MongoTraceStore } from "../db/mongo-trace-store";
import { systemClock } from "../db/system-clock";
import { createApi } from "./api";
import type { ApiContext } from "./ports";
import type { DemoServer } from "./server";

// Session token -> seeded principal id. The principal itself (tenant, role, scopes) is read from Atlas.
const TOKENS: Record<string, string> = { "tok-a-resp": "alice", "tok-a-rev": "rita", "tok-b-resp": "bob" };
// The simulated infra's true failing pool. Seeded services match the seeded fixes; anything else gets a stable derived pool.
const KNOWN_POOLS: Record<string, string> = {
  "tenantA|checkout-service": "cp-7f3a",
  "tenantA|search-service": "cp-1b9d",
  "tenantB|checkout-service": "cp-9e41",
};
export const truePool = (tenantId: string, service: string) => KNOWN_POOLS[`${tenantId}|${service}`] ?? `cp-${sha256(`${tenantId}|${service}`).slice(0, 4)}`;

// Atlas-backed composition root (GML_STORE=mongo). Memory, audit and traces are real; only the infra tools are simulated.
export async function buildMongoServer(env: Record<string, string | undefined>, opts: { fetch?: typeof fetch } = {}): Promise<DemoServer> {
  const db = await getDb();
  const repo = new MongoMemoryRepo(db, systemClock);
  const audit = new MongoAuditStore(db);
  const trace = new MongoTraceStore(db, systemClock);
  const deps: CoreDeps = {
    resolvePrincipal: async (t) => (TOKENS[t] ? await db.collection("principals").findOne({ _id: TOKENS[t] as never }) : null),
    repo,
    embedder: createEmbedder(),
    clock: systemClock,
    audit,
    newId: (prefix) => `${prefix}_${randomUUID()}`,
    embeddingModel: EMBEDDING_MODEL,
    policyVersion: "p1",
  };
  const reranker = voyageFromEnv(env, opts.fetch);
  if (reranker) deps.reranker = reranker;
  const layer = createMemoryLayer(deps);

  const apiKey = env["ANTHROPIC_API_KEY"];
  const model = env["GML_MODEL"] ?? DEFAULT_MODEL;
  const brain: AgentBrain = apiKey ? createLlmBrain({ apiKey, model, ...(opts.fetch ? { fetch: opts.fetch } : {}) }) : ruleBrain;
  const brainName = apiKey ? `llm:${model}` : "rule-brain";

  // Counters for the dashboard cards, same meaning as the autonomous loop's.
  const s = { running: false, ticks: 0, fixed: 0, escalated: 0, learned: 0, reused: 0, forgotten: 0, blocked: 0, rotations: 0, errors: 0, notifications: [] as unknown[] };
  const ctx: ApiContext = {
    resolver: deps.resolvePrincipal,
    layer,
    reads: { listMemories: (p, scopes) => repo.listMemories(p, scopes), listAudit: (p, n) => audit.list(p, n) },
    trace,
    evalStore: new MongoEvalStore(db),
    clock: systemClock,
    alerts: [],
    runLive: async (principal, sessionToken, alert) => {
      const pool = truePool(principal.tenantId, alert.service);
      const e = await runEpisode(alert, { sessionToken, purpose: "incident-triage" }, layer, brain, trace, systemClock, {
        principal,
        simulator: withFindings(makeSimulator(pool), pool),
        newId: deps.newId,
      });
      s.ticks++;
      if (e.fixed) s.fixed++;
      else s.escalated++;
      for (const t of e.turns) {
        if (t.learnedId) s.learned++;
        s.forgotten += t.forgotten?.length ?? 0;
        if (t.result.rejected) s.blocked++;
      }
      if (e.fixed && e.turns.length === 1 && e.turns[0]!.action.usedMemoryIds.length) s.reused++;
      const last = e.turns[e.turns.length - 1]!;
      return { action: last.action, result: last.result, traceId: last.traceId, traceComplete: last.traceComplete, brain: brainName, fixed: e.fixed, turns: e.turns };
    },
    proofReport: () => runProof([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], ruleBrain, { brainName: "rule-brain" }),
    demoMode: true,
    manual: { get: () => false, set: () => undefined },
    agentStatus: () => ({ ...s, brain: brainName, store: "mongo", notifierConfigured: false, actingAs: "session" }),
  };
  const labels = { "tok-a-resp": "Team A responder (alice)", "tok-a-rev": "Team A reviewer (rita)", "tok-b-resp": "Team B responder (bob)" };
  return { handle: createApi(ctx), sessions: Object.entries(labels).map(([token, label]) => ({ token, label })), demoMode: true, stop: () => undefined };
}
