import type { Caller, Memory } from "../contracts/contracts";
import { opContext } from "./audit";
import { SOURCE_AUTHORITY, hashClaim, inputSchema, isSuspicious, sourcesError, ttlValid } from "./claim";
import type { CoreDeps } from "./deps";
import { authorize } from "./policy";

export async function remember(
  deps: CoreDeps,
  input: unknown,
  caller: Caller,
): Promise<{ id: string; status: string; traceId: string }> {
  const { traceId, audit, refuse, authenticate } = opContext(deps, "remember", caller, input);

  const principal = await authenticate();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return refuse(principal, "INVALID_INPUT");
  const d = parsed.data;

  if (!ttlValid(d.memoryType, d.ttlMs)) return refuse(principal, "TTL_INVALID");
  const ttl = d.ttlMs;

  // Tenant and scope come from the principal only (G1).
  const scopeId = d.scope === "team" ? `team:${principal.tenantId}` : `private:${principal.id}`;
  const auth = authorize(principal, "remember", scopeId, caller.purpose);
  if (!auth.allowed) return refuse(principal, auth.reason);

  if (d.derivedFrom?.length) {
    const bad = await sourcesError(deps, principal, scopeId, d.derivedFrom);
    if (bad) return refuse(principal, bad);
  }

  const contentHash = hashClaim(d.text, d.value);
  if (await deps.repo.isTombstoned(principal, "", contentHash)) return refuse(principal, "TOMBSTONED");

  const existing = await deps.repo.findActiveByClaimKey(principal, [scopeId], d.claimKey);
  const same = existing.find((m) => m.contentHash === contentHash);
  if (same) {
    await audit(principal, "allow", ["DUPLICATE"], [same._id]);
    return { id: same._id, status: "duplicate", traceId };
  }

  const quarantined = isSuspicious(d.text, d.value);
  const conflict = !quarantined && existing.length > 0;
  const status = quarantined ? "quarantined" : conflict ? "disputed" : "active";
  const reasons = quarantined ? (["INJECTION_SUSPECTED"] as const) : conflict ? (["CONFLICT"] as const) : [];

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
  await audit(principal, "allow", [...reasons], [doc._id]);
  await deps.repo.insert(principal, doc);
  return { id: doc._id, status, traceId };
}
