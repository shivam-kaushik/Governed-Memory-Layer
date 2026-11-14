import { z } from "zod";
import type { Caller, Memory, Principal } from "../contracts/contracts";
import { GovernanceError } from "../core/errors";
import { resolvePrincipal } from "../core/identity";
import { authorize } from "../core/policy";
import type { ApiContext, ApiRequest, ApiResponse } from "./ports";

// Purpose is fixed server-side. Nothing in a request can choose it (G1).
export const DASHBOARD_PURPOSE = "incident-triage";
const DAY = 86_400_000;
const AUDIT_LIMIT = 100;

const id = z.string().regex(/^[\w.:-]{1,128}$/);
const reason = z.string().min(1).max(500);
// zod strips unknown keys: forged tenantId, scopeId, role, createdBy never reach the layer.
const correctBody = z.object({
  id,
  reason,
  text: z.string().min(1).max(2000).optional(),
  value: z.record(z.string(), z.unknown()).optional(),
  ttlMs: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
const forgetBody = z.object({ id, reason });
const runBody = z.object({ alertId: z.string().min(1).max(128) });
const sinceQuery = z.coerce.number().int().min(0);
const MONITOR_WINDOW_MS = 3_600_000;
const EVENT_CAP = 500;
const modeBody = z.object({ manual: z.boolean() });
const clockBody = z.object({ op: z.enum(["advance_day", "jump_to_expiry"]) });

const res = (status: number, json: unknown): ApiResponse => ({ status, json });
const STATUS_FOR: Partial<Record<string, number>> = { UNKNOWN_PRINCIPAL: 401, INVALID_INPUT: 400, TTL_INVALID: 400 };

function tokenOf(req: ApiRequest): string {
  const h = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v ?? ""]));
  const bearer = /^Bearer (.+)$/.exec(h["authorization"] ?? "");
  if (bearer?.[1]) return bearer[1];
  const cookie = (h["cookie"] ?? "").split(";").map((c) => c.trim().split("="));
  return cookie.find(([k]) => k === "session")?.[1] ?? "";
}

// Fields a browser may see. No embedding, hash, tenant or model.
function memoryView(m: Memory, nowMs: number) {
  return {
    id: m._id,
    scope: m.scopeId,
    status: m.status,
    version: m.version,
    supersedes: m.supersedes ?? null,
    derivedFrom: m.derivedFrom,
    memoryType: m.memoryType,
    claimKey: m.claimKey,
    text: m.text,
    value: m.value,
    appliesTo: m.appliesTo,
    confidence: m.confidence,
    source: m.source,
    createdBy: m.createdBy,
    expiresAtMs: m.expiresAtMs,
    expiresInMs: m.expiresAtMs - nowMs,
  };
}

type Handler = (c: ApiContext, p: Principal, caller: Caller, req: ApiRequest, param: string) => Promise<ApiResponse>;
interface Route {
  re: RegExp;
  methods: Record<string, Handler>;
  demoOnly?: boolean;
  manual?: boolean; // human-driven action: only when the manual switch is on
}

const visibleMemories = async (c: ApiContext, p: Principal) => {
  // Same policy gate as recall: only scopes the caller may read for the fixed purpose.
  const scopes = p.scopes.filter((s) => authorize(p, "recall", s, DASHBOARD_PURPOSE).allowed);
  return (await c.reads.listMemories(p, scopes)).filter((m) => m.tenantId === p.tenantId && scopes.includes(m.scopeId));
};

const ROUTES: Route[] = [
  {
    re: /^\/api\/memories$/,
    methods: {
      GET: async (c, p) => {
        const now = c.clock.nowMs();
        return res(200, { memories: (await visibleMemories(c, p)).map((m) => memoryView(m, now)) });
      },
    },
  },
  {
    re: /^\/api\/memories\/correct$/,
    manual: true,
    methods: {
      POST: async (c, _p, caller, req) => {
        const b = correctBody.safeParse(req.body);
        if (!b.success) return res(400, { error: "INVALID_INPUT" });
        const { id: target, ...patch } = b.data;
        return res(200, await c.layer.correct(target, patch, caller));
      },
    },
  },
  {
    re: /^\/api\/memories\/forget$/,
    manual: true,
    methods: {
      POST: async (c, _p, caller, req) => {
        const b = forgetBody.safeParse(req.body);
        if (!b.success) return res(400, { error: "INVALID_INPUT" });
        return res(200, await c.layer.forget(b.data.id, b.data.reason, caller));
      },
    },
  },
  {
    re: /^\/api\/audit$/,
    methods: {
      GET: async (c, p) => {
        const rows = (await c.reads.listAudit(p, AUDIT_LIMIT)).filter((e) => e.tenantId === p.tenantId);
        // Responders see their own decisions; reviewers and admins see the tenant.
        return res(200, { events: p.role === "responder" ? rows.filter((e) => e.actorId === p.id) : rows });
      },
    },
  },
  {
    re: /^\/api\/traces\/([\w.:-]{1,128})$/,
    methods: {
      GET: async (c, p, _caller, _req, traceId) => {
        const events = (await c.trace.listByTrace(p, traceId)).filter((e) => e.tenantId === p.tenantId);
        return events.length ? res(200, { events }) : res(404, { error: "NOT_FOUND" });
      },
    },
  },
  {
    re: /^\/api\/monitor\/events$/,
    methods: {
      GET: async (c, p, _caller, req) => {
        const since = sinceQuery.safeParse(req.query?.["since"] ?? "0");
        if (!since.success) return res(400, { error: "INVALID_INPUT" });
        const events = [];
        for await (const e of c.trace.feed(p, since.data)) {
          if (e.tenantId === p.tenantId) events.push(e);
          if (events.length >= EVENT_CAP) break;
        }
        return res(200, { events });
      },
    },
  },
  { re: /^\/api\/monitor\/metrics$/, methods: { GET: async (c, p) => res(200, { metrics: await c.trace.metrics(p, MONITOR_WINDOW_MS) }) } },
  {
    re: /^\/api\/monitor\/alerts$/,
    methods: { GET: async (c, p) => res(200, { alerts: (await c.trace.alerts(p, 0)).filter((a) => a.tenantId === p.tenantId) }) },
  },
  {
    re: /^\/api\/agent\/status$/,
    methods: { GET: async (c) => res(200, { manual: c.manual?.get() ?? true, agent: c.agentStatus?.() ?? null }) },
  },
  {
    re: /^\/api\/agent\/mode$/,
    methods: {
      POST: async (c, p, _caller, req) => {
        if (!c.manual) return res(409, { error: "MODE_FIXED" });
        if (p.role === "responder") return res(403, { error: "OP_DENIED" });
        const b = modeBody.safeParse(req.body);
        if (!b.success) return res(400, { error: "INVALID_INPUT" });
        c.manual.set(b.data.manual);
        return res(200, { manual: c.manual.get() });
      },
    },
  },
  { re: /^\/api\/proof$/, methods: { GET: async (c) => res(200, { report: await c.proofReport() }) } },
  { re: /^\/api\/live\/alerts$/, methods: { GET: async (c) => res(200, { alerts: c.alerts }) } },
  {
    re: /^\/api\/live\/run$/,
    manual: true,
    methods: {
      POST: async (c, p, caller, req) => {
        const b = runBody.safeParse(req.body);
        if (!b.success) return res(400, { error: "INVALID_INPUT" });
        const alert = c.alerts.find((a) => a.id === b.data.alertId);
        return alert ? res(200, await c.runLive(p, caller.sessionToken, alert)) : res(404, { error: "NOT_FOUND" });
      },
    },
  },
  {
    re: /^\/api\/live\/clock$/,
    demoOnly: true,
    manual: true,
    methods: {
      POST: async (c, p, _caller, req) => {
        const b = clockBody.safeParse(req.body);
        if (!b.success) return res(400, { error: "INVALID_INPUT" });
        if (!c.clock.advanceMs) return res(409, { error: "CLOCK_FIXED" });
        const now = c.clock.nowMs();
        if (b.data.op === "advance_day") {
          c.clock.advanceMs(DAY);
        } else {
          const next = (await visibleMemories(c, p))
            .filter((m) => m.status === "active" && m.expiresAtMs > now)
            .map((m) => m.expiresAtMs)
            .sort((a, b) => a - b)[0];
          if (next === undefined) return res(409, { error: "NOTHING_TO_EXPIRE" });
          c.clock.advanceMs(next - now); // lands exactly on expiresAtMs: now >= expiresAt is ineligible
        }
        return res(200, { nowMs: c.clock.nowMs() });
      },
    },
  },
];

// Framework-free request handler. Next route files only forward to this.
export function createApi(ctx: ApiContext): (req: ApiRequest) => Promise<ApiResponse> {
  return async (req) => {
    let param = "";
    const route = ROUTES.find((r) => {
      const m = r.re.exec(req.path);
      param = m?.[1] ?? "";
      return m !== null && !(r.demoOnly && !ctx.demoMode);
    });
    if (!route) return res(404, { error: "NOT_FOUND" });
    const handler = route.methods[req.method];
    if (!handler) return res(405, { error: "METHOD_NOT_ALLOWED" });

    const token = tokenOf(req);
    const principal = await resolvePrincipal(ctx.resolver, token);
    if (!principal) return res(401, { error: "UNAUTHENTICATED" });
    if (route.manual && ctx.manual && !ctx.manual.get()) return res(403, { error: "MANUAL_DISABLED" });
    try {
      return await handler(ctx, principal, { sessionToken: token, purpose: DASHBOARD_PURPOSE }, req, param);
    } catch (e) {
      if (e instanceof GovernanceError) return res(STATUS_FOR[e.code] ?? 403, { error: e.code, traceId: e.traceId });
      return res(500, { error: "INTERNAL" }); // never echo internal messages
    }
  };
}
