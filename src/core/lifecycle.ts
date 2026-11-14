import { z } from "zod";
import type { Caller, Memory, Principal } from "../contracts/contracts";
import { opContext } from "./audit";
import { hashClaim, inputSchema, isSuspicious, sourcesError, ttlValid } from "./claim";
import type { CoreDeps } from "./deps";
import { authorize } from "./policy";

const ID = /^[\w.:-]{1,128}$/; // one concrete id: no wildcard, list or query (over-deletion guard)

// scope is omitted: a patch can never move a memory to another scope (unknown keys are stripped).
const patchSchema = inputSchema.omit({ scope: true }).partial().extend({ reason: z.string().min(1) });

// All transitive children via derivedFrom. The visited set guards against cycles.
async function descendants(deps: CoreDeps, p: Principal, id: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    for (const child of await deps.repo.findDerived(p, queue.shift()!)) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

export async function correct(
  deps: CoreDeps,
  id: string,
  patch: unknown,
  caller: Caller,
): Promise<{ newId: string; supersedes: string; traceId: string }> {
  const { traceId, audit, refuse, authenticate } = opContext(deps, "correct", caller, { id, patch });
  const p = await authenticate();
  if (typeof id !== "string" || !ID.test(id)) return refuse(p, "INVALID_INPUT");
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return refuse(p, "INVALID_INPUT");
  const d = parsed.data;

  const old = await deps.repo.getById(p, id);
  if (!old) return refuse(p, "SCOPE_DENIED"); // missing, other tenant and unheld scope look the same
  const auth = authorize(p, "correct", old.scopeId, caller.purpose);
  if (!auth.allowed) return refuse(p, auth.reason);
  if (old.status !== "active" && old.status !== "disputed") return refuse(p, "INVALID_INPUT");

  const type = d.memoryType ?? old.memoryType;
  if (d.ttlMs !== undefined && !ttlValid(type, d.ttlMs)) return refuse(p, "TTL_INVALID");
  const text = d.text ?? old.text;
  const value = d.value ?? old.value;
  if (isSuspicious(text, value)) return refuse(p, "INJECTION_SUSPECTED");
  if (d.derivedFrom?.length) {
    const bad = await sourcesError(deps, p, old.scopeId, d.derivedFrom);
    if (bad) return refuse(p, bad);
  }

  const now = deps.clock.nowMs();
  const next: Memory = {
    ...old,
    _id: deps.newId("mem"),
    memoryType: type,
    claimKey: d.claimKey ?? old.claimKey,
    text,
    value,
    appliesTo: d.appliesTo ?? old.appliesTo,
    embedding: d.text === undefined ? old.embedding : await deps.embedder.embed(text),
    embeddingModel: deps.embeddingModel,
    contentHash: hashClaim(text, value),
    version: old.version + 1,
    supersedes: old._id,
    derivedFrom: d.derivedFrom ?? old.derivedFrom,
    validFromMs: now,
    expiresAtMs: d.ttlMs !== undefined ? now + d.ttlMs : old.expiresAtMs, // correcting never extends validity by itself
    status: "active",
    confidence: d.confidence ?? old.confidence,
    source: d.source ?? old.source,
    createdBy: p.id,
    createdAtMs: now,
    policyVersion: deps.policyVersion,
  };

  // Audit first, then one atomic supersede, then invalidate what was derived from the old claim.
  await audit(p, "allow", [], [next._id]);
  await deps.repo.supersede(p, old._id, next);
  const kids = await deps.repo.byIds(p, await descendants(deps, p, old._id));
  for (const k of kids) if (k.status === "active") await deps.repo.setStatus(p, k._id, "disputed");
  return { newId: next._id, supersedes: old._id, traceId };
}

export async function forget(
  deps: CoreDeps,
  id: string,
  reason: string,
  caller: Caller,
): Promise<{ tombstoneId: string; cascadedIds: string[]; traceId: string }> {
  const { traceId, audit, refuse, authenticate } = opContext(deps, "forget", caller, { id, reason });
  const p = await authenticate();
  if (typeof id !== "string" || !ID.test(id) || typeof reason !== "string" || !reason) return refuse(p, "INVALID_INPUT");

  const doc = await deps.repo.getById(p, id);
  if (!doc) return refuse(p, "SCOPE_DENIED");
  const auth = authorize(p, "forget", doc.scopeId, caller.purpose);
  if (!auth.allowed) return refuse(p, auth.reason);

  // Provenance-derived children only: never a query or a list of unrelated ids.
  const cascadedIds = await descendants(deps, p, id);
  await audit(p, "allow", [], [id, ...cascadedIds]);
  // One repo transaction: tombstones are written before content is purged.
  const { tombstoneIds } = await deps.repo.tombstoneAndPurge(p, [id, ...cascadedIds], reason);
  return { tombstoneId: tombstoneIds[0] ?? "", cascadedIds, traceId };
}

export async function promote(
  deps: CoreDeps,
  id: string,
  caller: Caller,
): Promise<{ newId: string; traceId: string }> {
  const { traceId, audit, refuse, authenticate } = opContext(deps, "promote", caller, { id });
  const p = await authenticate();
  if (typeof id !== "string" || !ID.test(id)) return refuse(p, "INVALID_INPUT");

  const teamScope = `team:${p.tenantId}`;
  const auth = authorize(p, "promote", teamScope, caller.purpose); // reviewer or admin only
  if (!auth.allowed) return refuse(p, auth.reason);

  const src = await deps.repo.getById(p, id);
  if (!src || !p.scopes.includes(src.scopeId)) return refuse(p, "SCOPE_DENIED");
  if (!src.scopeId.startsWith("private:") || src.status !== "active") return refuse(p, "INVALID_INPUT");

  const existing = await deps.repo.findActiveByClaimKey(p, [teamScope], src.claimKey);
  const now = deps.clock.nowMs();
  const { supersedes: _drop, ...rest } = src;
  const next: Memory = {
    ...rest,
    _id: deps.newId("mem"),
    scopeId: teamScope,
    derivedFrom: [src._id], // forgetting or correcting the source reaches the team copy
    version: Math.max(0, ...existing.map((m) => m.version)) + 1,
    validFromMs: now,
    status: existing.length ? "disputed" : "active",
    createdBy: p.id,
    createdAtMs: now,
    policyVersion: deps.policyVersion,
  };
  await audit(p, "allow", [], [next._id]);
  await deps.repo.insert(p, next);
  return { newId: next._id, traceId };
}
