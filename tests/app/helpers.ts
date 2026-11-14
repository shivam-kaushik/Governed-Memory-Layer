import { ruleBrain } from "../../src/agent/brain-rules";
import type { ScenarioKind } from "../../src/agent/scenarios";
import { runTriage } from "../../src/agent/triage-agent";
import { createApi } from "../../src/app/api";
import type { ApiContext, ApiRequest } from "../../src/app/ports";
import { FakeEvalStore } from "../../src/fakes/fake-eval-store";
import { buildWorld } from "../agent/helpers";

export const A_RESP = "tok-a-resp";
export const A_REV = "tok-a-rev";
export const B_RESP = "tok-b-resp";

export async function apiWorld(kind: ScenarioKind = "valid_fix", seed = 1, over: Partial<ApiContext> = {}) {
  const w = await buildWorld(kind, seed);
  const ctx: ApiContext = {
    resolver: w.deps.resolvePrincipal,
    layer: w.layer,
    reads: {
      listMemories: (p, scopes) => w.repo.listMemories(p, scopes),
      listAudit: (p, limit) => w.audit.list(p, limit),
    },
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
    proofReport: async () => ({ brain: "rule-brain", seeds: 0 }),
    demoMode: true,
    ...over,
  };
  const api = createApi(ctx);
  const call = (method: string, path: string, token?: string, body?: unknown, query?: Record<string, string>) => {
    const req: ApiRequest = { method, path, headers: token ? { authorization: `Bearer ${token}` } : {}, query, body };
    return api(req);
  };
  return { ...w, ctx, call, raw: api };
}
