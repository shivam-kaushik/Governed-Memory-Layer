import semver from "semver";
import { z } from "zod";
import type { Caller, EvidenceCard, Memory, Principal, ReasonCode, RecallResult } from "../contracts/contracts";
import { opContext } from "./audit";
import type { CoreDeps } from "./deps";
import { resolvePrincipal } from "./identity";
import { authorize } from "./policy";
import { recencyScore, rerankScore } from "./rerank";

const nonEmpty = z.string().min(1);
const querySchema = z.object({
  text: nonEmpty,
  service: nonEmpty,
  version: nonEmpty,
  environment: nonEmpty,
  limit: z.number().int().min(1).max(20).optional(),
});
const DEFAULT_LIMIT = 5;
const CANDIDATE_FACTOR = 3; // over-fetch: recheck and applicability drop candidates

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Pipeline (plan 3.2): identity, purpose, scope, embed, vectorSearch, recheck, applicability, rerank, cards, audit.
// A denial returns decision "deny" with no cards. An audit failure throws: no cards are returned.
// shortcut: no token budget yet, only a card-count limit.
export async function recall(deps: CoreDeps, input: unknown, caller: Caller): Promise<RecallResult> {
  const { traceId, audit } = opContext(deps, "recall", caller, input);
  const deny = async (p: Principal | null, code: ReasonCode): Promise<RecallResult> => {
    await audit(p, "deny", [code]);
    return { cards: [], traceId, decision: "deny" };
  };

  const principal = await resolvePrincipal(deps.resolvePrincipal, caller.sessionToken);
  if (!principal) return deny(null, "UNKNOWN_PRINCIPAL");
  if (!principal.purposes.includes(caller.purpose)) return deny(principal, "PURPOSE_DENIED");

  const parsed = querySchema.safeParse(input);
  if (!parsed.success) return deny(principal, "INVALID_INPUT");
  const q = parsed.data;
  const limit = q.limit ?? DEFAULT_LIMIT;

  const scopeIds = principal.scopes.filter((s) => authorize(principal, "recall", s, caller.purpose).allowed);
  if (scopeIds.length === 0) return deny(principal, "SCOPE_DENIED");

  const now = deps.clock.nowMs();
  const hits = await deps.repo.vectorSearch(principal, {
    vector: await deps.embedder.embed(q.text),
    scopeIds,
    nowMs: now,
    limit: limit * CANDIDATE_FACTOR,
  });
  // The index result is a candidate list only: reload everything from the authoritative store.
  const docs = new Map((await deps.repo.byIds(principal, hits.map((h) => h.id))).map((d) => [d._id, d]));

  const rejected: { id: string; reason: ReasonCode }[] = [];
  const ranked: Array<{ doc: Memory; score: number }> = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    const doc = docs.get(hit.id);
    const reason = doc ? await recheck(deps, principal, scopeIds, doc, now) : await missing(deps, principal, hit.id);
    const bad = reason ?? (doc ? applicability(doc, q) : null);
    if (bad || !doc) {
      rejected.push({ id: hit.id, reason: bad ?? "STALE_INDEX" });
      continue;
    }
    const score = rerankScore({
      sim: clamp01(hit.score),
      confidence: doc.confidence,
      authority: doc.sourceAuthority,
      recency: recencyScore(now - doc.createdAtMs),
    });
    ranked.push({ doc, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.doc._id.localeCompare(b.doc._id));
  const cards: EvidenceCard[] = ranked.slice(0, limit).map(({ doc, score }) => ({
    memoryId: doc._id,
    version: doc.version,
    statement: doc.text,
    value: doc.value,
    expiresAtMs: doc.expiresAtMs,
    confidence: doc.confidence,
    sourceAuthority: doc.sourceAuthority,
    score,
  }));

  await audit(principal, "allow", cards.length ? [] : ["NO_ELIGIBLE"], cards.map((c) => c.memoryId), rejected);
  return { cards, traceId, decision: "allow" };
}

async function missing(deps: CoreDeps, p: Principal, id: string): Promise<ReasonCode> {
  return (await deps.repo.isTombstoned(p, id)) ? "TOMBSTONED" : "STALE_INDEX";
}

async function recheck(deps: CoreDeps, p: Principal, scopeIds: string[], d: Memory, now: number): Promise<ReasonCode | null> {
  if (d.tenantId !== p.tenantId || !scopeIds.includes(d.scopeId)) return "OTHER_SCOPE";
  if (await deps.repo.isTombstoned(p, d._id, d.contentHash)) return "TOMBSTONED";
  if (d.status === "quarantined" || d.status === "disputed") return "QUARANTINED";
  if (d.status === "expired" || now >= d.expiresAtMs || now < d.validFromMs) return "EXPIRED";
  if (d.status !== "active") return "STALE_INDEX"; // superseded or deleted: the index is behind
  return null;
}

function applicability(d: Memory, q: { service: string; version: string; environment: string }): ReasonCode | null {
  if (d.appliesTo.service !== q.service) return "WRONG_SERVICE";
  if (d.appliesTo.environment !== q.environment) return "WRONG_ENVIRONMENT";
  // semver.satisfies is false for an invalid version or range: not applicable, never a match.
  if (!semver.valid(q.version) || !semver.validRange(d.appliesTo.versionRange)) return "WRONG_VERSION";
  return semver.satisfies(q.version, d.appliesTo.versionRange) ? null : "WRONG_VERSION";
}
