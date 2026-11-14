import { randomUUID } from "node:crypto";
import { ruleBrain, type AgentBrain } from "../agent/brain-rules";
import { runEpisode } from "../agent/episode";
import { createLlmChat, ruleChat } from "../agent/chat-brain";
import { createLlmBrain, DEFAULT_MODEL } from "../agent/llm-brain";
import { makeSimulator, withFindings } from "../agent/tools";
import { EMBEDDING_MODEL } from "../contracts/contracts";
import { createMemoryLayer } from "../core";
import { sha256 } from "../core/audit";
import { resolvePrincipal } from "../core/identity";
import type { CoreDeps } from "../core/deps";
import { voyageFromEnv } from "../core/voyage";
import { runProof } from "../eval/run";
import { getDb } from "../db/client";
import { createEmbedder } from "../db/embedder";
import { resetAll } from "../db/seed";
import { MongoAuditStore } from "../db/mongo-audit-store";
import { MongoEvalStore } from "../db/mongo-eval-store";
import { MongoMemoryRepo } from "../db/mongo-memory-repo";
import { MongoTraceStore } from "../db/mongo-trace-store";
import { systemClock } from "../db/system-clock";
import { createApi } from "./api";
import { behaviorExperiment, correctExperiment, expiryCheck, expiryStart, forgetExperiment, isolationExperiment, type JudgeEnv } from "./judge";
import type { ApiContext } from "./ports";
import type { DemoServer } from "./server";

// Session token -> seeded principal id. The principal itself (tenant, role, scopes) is read from Atlas.
const TOKENS: Record<string, string> = { "tok-a-resp": "alice", "tok-a-rev": "rita", "tok-b-resp": "bob" };
// The simulated infra's true failing pool. Seeded services match the seeded fixes; anything else gets a stable derived pool.
const KNOWN_POOLS: Record<string, string> = {
  "tenantA|session-service": "cp-7f3a",
  "tenantA|billing-service": "cp-1b9d",
  "tenantB|session-service": "cp-9e41",
};
// Drift: the real pool can be rotated at runtime so learned fixes go stale (see the Drift experiment).
const drifted = new Map<string, string>();
export const truePool = (tenantId: string, service: string) =>
  drifted.get(`${tenantId}|${service}`) ?? KNOWN_POOLS[`${tenantId}|${service}`] ?? `cp-${sha256(`${tenantId}|${service}`).slice(0, 4)}`;

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
    chat: apiKey ? createLlmChat({ apiKey, model, ...(opts.fetch ? { fetch: opts.fetch } : {}) }) : ruleChat,
    proofReport: () => runProof([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], ruleBrain, { brainName: "rule-brain" }),
    demoMode: true,
    manual: { get: () => true, set: () => undefined }, // no background loop here: human actions (correct, forget) are always on; policy still decides
    agentStatus: () => ({ ...s, brain: brainName, store: "MongoDB Atlas", nowMs: systemClock.nowMs(), clockControllable: false, notifierConfigured: false, actingAs: "session" }),
  };
  // Live Q&A harness: fixed demo principals, fresh nonce per run. Only an action name and an id arrive from the request.
  const ALERT_TEXT = "charging sessions failing with 5xx on session-service 3.2.1 in prod after deploy";
  const judgeEnv = (): JudgeEnv => ({
    layer,
    reads: ctx.reads,
    resolver: deps.resolvePrincipal,
    tokens: { eco: "tok-a-resp", ecoReviewer: "tok-a-rev", other: "tok-b-resp" },
    brain,
    nonce: randomUUID().slice(0, 8),
    trials: 5,
    query: { text: ALERT_TEXT, service: "session-service", version: "3.2.1", environment: "prod" },
    now: () => systemClock.nowMs(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)), // composition root: the only timer, used to let the vector index catch up
  });
  ctx.judge = {
    run: async (action, input, principal) => {
      const e = judgeEnv();
      switch (action) {
        case "isolation": return isolationExperiment(e);
        case "correct": return correctExperiment(e);
        case "forget": return forgetExperiment(e);
        case "behavior": return { ...(await behaviorExperiment(e)), brain: brainName };
        case "expiry-start": return { ...(await expiryStart(e, 15_000)), nowMs: systemClock.nowMs() };
        case "expiry-check": return input.id ? expiryCheck(e, input.id) : { error: "INVALID_INPUT" };
        case "drift": {
          // The infrastructure changes under the agent: the pool it remembered is no longer the failing one.
          const eco = (await deps.resolvePrincipal("tok-a-resp")) as { tenantId: string };
          drifted.set(`${eco.tenantId}|session-service`, `cp-${sha256(`drift|${randomUUID()}`).slice(0, 6)}`);
          const alert = { id: `drift-${e.nonce}`, service: "session-service", version: "3.2.1", environment: "prod", symptom: ALERT_TEXT, text: ALERT_TEXT };
          return ctx.runLive((await resolvePrincipal(deps.resolvePrincipal, "tok-a-resp"))!, "tok-a-resp", alert);
        }
        case "reset": {
          // Destructive: wipes memories, audit, traces and tombstones, then restores the seed set. Reviewers and admins only.
          if (principal.role === "responder") return { error: "OP_DENIED" };
          await resetAll(db, deps.embedder, systemClock);
          drifted.clear();
          return { ok: true };
        }
        default: return { error: "NOT_FOUND" };
      }
    },
  };
  const labels = { "tok-a-resp": "EcoCharge Ops responder (alice)", "tok-a-rev": "EcoCharge Ops reviewer (rita)", "tok-b-resp": "Other client responder (bob)" };
  return { handle: createApi(ctx), sessions: Object.entries(labels).map(([token, label]) => ({ token, label })), demoMode: true, stop: () => undefined };
}
