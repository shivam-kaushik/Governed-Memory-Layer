import { createHash } from "node:crypto";
import { z } from "zod";
import type { Caller, Decision, Memory, MemoryType, Principal, ReasonCode } from "../contracts/contracts";
import type { CoreDeps } from "./deps";
import { GovernanceError } from "./errors";
import { resolvePrincipal } from "./identity";
import { scanInjection } from "./inject-scan";
import { authorize } from "./policy";

const DAY = 86_400_000;
const MAX_TTL_MS: Record<MemoryType, number> = {
  fix: 30 * DAY,
  playbook: 90 * DAY,
  preference: 365 * DAY,
  fact: 90 * DAY, // not in plan.md: fail-closed choice, flagged to the user
};
const SOURCE_AUTHORITY = 0.5; // shortcut: constant until plan.md defines authority

const nonEmpty = z.string().min(1);
// ttlMs is checked separately so it reports TTL_INVALID, not INVALID_INPUT. Unknown keys are stripped.
const inputSchema = z.object({
  memoryType: z.enum(["fix", "preference", "fact", "playbook"]),
  claimKey: nonEmpty,
  text: z.string().min(1).max(2000),
  value: z.record(z.string(), z.unknown()),
  appliesTo: z.object({ service: nonEmpty, versionRange: nonEmpty, environment: nonEmpty }),
  scope: z.enum(["team", "private"]),
  ttlMs: z.unknown().optional(),
  confidence: z.number().min(0).max(1),
  source: z.object({ type: nonEmpty, ref: nonEmpty }),
  derivedFrom: z.array(nonEmpty).optional(),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function hasSuspiciousString(v: unknown): boolean {
  if (typeof v === "string") return scanInjection(v).suspicious;
  if (Array.isArray(v)) return v.some(hasSuspiciousString);
  if (v && typeof v === "object") return Object.values(v).some(hasSuspiciousString);
  return false;
}

export async function remember(
  deps: CoreDeps,
  input: unknown,
  caller: Caller,
): Promise<{ id: string; status: string; traceId: string }> {
  const traceId = deps.newId("tr");
  // queryHash is a hash of the raw input: never the input itself (G15).
  let queryHash = "";
  try {
    queryHash = sha256(JSON.stringify(input) ?? "");
  } catch {
    queryHash = sha256("unserializable");
  }

  const audit = (
    p: Principal | null,
    decision: Decision,
    reasonCodes: ReasonCode[],
    selectedIds: string[] = [],
  ) =>
    deps.audit.record({
      _id: deps.newId("aud"),
      traceId,
      tenantId: p?.tenantId ?? "unknown",
      actorId: p?.id ?? "unknown",
      purpose: caller.purpose,
      op: "remember",
      decision,
      reasonCodes,
      selectedIds,
      rejectedIds: [],
      queryHash,
      createdAtMs: deps.clock.nowMs(),
    });
  const refuse = async (p: Principal | null, code: ReasonCode): Promise<never> => {
    await audit(p, "deny", [code]);
    throw new GovernanceError(code, traceId);
  };

  const principal = await resolvePrincipal(deps.resolvePrincipal, caller.sessionToken);
  if (!principal) return refuse(null, "UNKNOWN_PRINCIPAL");
  if (!principal.purposes.includes(caller.purpose)) return refuse(principal, "PURPOSE_DENIED");

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return refuse(principal, "INVALID_INPUT");
  const d = parsed.data;

  const ttl = d.ttlMs;
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_TTL_MS[d.memoryType]) {
    return refuse(principal, "TTL_INVALID");
  }

  // Tenant and scope come from the principal only (G1).
  const scopeId = d.scope === "team" ? `team:${principal.tenantId}` : `private:${principal.id}`;
  const auth = authorize(principal, "remember", scopeId, caller.purpose);
  if (!auth.allowed) return refuse(principal, auth.reason);

  const contentHash = sha256(`${d.text}\n${JSON.stringify(d.value)}`);
  const existing = await deps.repo.findActiveByClaimKey(principal, [scopeId], d.claimKey);
  const same = existing.find((m) => m.contentHash === contentHash);
  if (same) {
    await audit(principal, "allow", ["DUPLICATE"], [same._id]);
    return { id: same._id, status: "duplicate", traceId };
  }

  const quarantined = scanInjection(d.text).suspicious || hasSuspiciousString(d.value);
  const conflict = !quarantined && existing.length > 0;
  const status = quarantined ? "quarantined" : conflict ? "disputed" : "active";
  const reasons: ReasonCode[] = quarantined ? ["INJECTION_SUSPECTED"] : conflict ? ["CONFLICT"] : [];

  const now = deps.clock.nowMs();
  const doc: Memory = {
    _id: deps.newId("mem"),
    tenantId: principal.tenantId,
    scopeId,
    purposeTags: [caller.purpose],
    memoryType: d.memoryType,
    claimKey: d.claimKey,
    text: d.text,
    value: d.value,
    appliesTo: d.appliesTo,
    embedding: await deps.embedder.embed(d.text),
    embeddingModel: deps.embeddingModel,
    contentHash,
    version: Math.max(0, ...existing.map((m) => m.version)) + 1,
    derivedFrom: d.derivedFrom ?? [],
    validFromMs: now,
    expiresAtMs: now + ttl,
    status,
    confidence: d.confidence,
    sourceAuthority: SOURCE_AUTHORITY,
    source: d.source,
    createdBy: principal.id,
    createdAtMs: now,
    policyVersion: deps.policyVersion,
  };

  // Audit first: if it fails, nothing is stored (G15).
  await audit(principal, "allow", reasons, [doc._id]);
  await deps.repo.insert(principal, doc);
  return { id: doc._id, status, traceId };
}
