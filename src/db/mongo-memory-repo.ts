import type { Db, Collection } from "mongodb";
import type { Memory, MemoryRepo, Principal } from "../contracts/contracts.js";
import { VECTOR_INDEX_NAME } from "./vector-index.js";

// Grace period between expiry and the TTL cleanup index removing the doc.
export const PURGE_GRACE_MS = 7 * 24 * 3600 * 1000;

// tenantId always comes from the Principal argument, never from a doc or filter the caller built (G1, G3).
export function derivedQuery(p: Principal, id: string) {
  return { filter: { tenantId: p.tenantId, derivedFrom: id }, hint: "derivedFrom_1" };
}

export const NUM_CANDIDATES = 200;

// Trusted prefilter (plan 4.4): built only from the Principal and server-resolved scopes/time.
// Anything else on `q` (e.g. a forged tenantId) is never read.
export function buildVectorSearchPipeline(
  p: Principal,
  q: { vector: number[]; scopeIds: string[]; nowMs: number; limit: number },
  exact = false,
): object[] {
  const search: Record<string, unknown> = {
    index: VECTOR_INDEX_NAME,
    path: "embedding",
    queryVector: q.vector,
    limit: q.limit,
    filter: {
      $and: [
        { tenantId: { $eq: p.tenantId } },
        { scopeId: { $in: q.scopeIds } },
        { status: { $eq: "active" } },
        { validFromMs: { $lte: q.nowMs } },
        { expiresAtMs: { $gt: q.nowMs } },
      ],
    },
  };
  if (exact) search.exact = true; else search.numCandidates = NUM_CANDIDATES;
  return [{ $vectorSearch: search }, { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } }];
}

export class MongoMemoryRepo implements MemoryRepo {
  constructor(protected readonly db: Db) {}

  protected get memories(): Collection<any> { return this.db.collection("memories"); }
  protected get tombstones(): Collection<any> { return this.db.collection("tombstones"); }

  async insert(p: Principal, doc: Memory): Promise<void> {
    await this.memories.insertOne({ ...doc, tenantId: p.tenantId, purgeAt: new Date(doc.expiresAtMs + PURGE_GRACE_MS) });
  }

  async getById(p: Principal, id: string): Promise<Memory | null> {
    return (await this.memories.findOne({ _id: id, tenantId: p.tenantId })) as Memory | null;
  }

  async byIds(p: Principal, ids: string[]): Promise<Memory[]> {
    if (ids.length === 0) return [];
    return (await this.memories.find({ _id: { $in: ids }, tenantId: p.tenantId }).toArray()) as Memory[];
  }

  async findActiveByClaimKey(p: Principal, scopeIds: string[], claimKey: string): Promise<Memory[]> {
    if (scopeIds.length === 0) return [];
    return (await this.memories.find({ tenantId: p.tenantId, scopeId: { $in: scopeIds }, claimKey, status: "active" }).toArray()) as Memory[];
  }

  async setStatus(p: Principal, id: string, status: Memory["status"]): Promise<void> {
    await this.memories.updateOne({ _id: id, tenantId: p.tenantId }, { $set: { status } });
  }

  async findDerived(p: Principal, id: string): Promise<string[]> {
    const { filter, hint } = derivedQuery(p, id);
    const rows = await this.memories.find(filter, { projection: { _id: 1 } }).hint(hint).toArray();
    return rows.map((r) => r._id as string);
  }

  async isTombstoned(p: Principal, id: string, contentHash?: string): Promise<boolean> {
    const or: object[] = [{ targetId: id }];
    if (contentHash) or.push({ contentHash });
    return (await this.tombstones.countDocuments({ tenantId: p.tenantId, $or: or }, { limit: 1 })) > 0;
  }

  // Candidate list only: the index is eventually consistent, so callers MUST recheck via byIds (plan 3.2).
  async vectorSearch(
    p: Principal,
    q: { vector: number[]; scopeIds: string[]; nowMs: number; limit: number },
    opts: { exact?: boolean } = {},
  ): Promise<Array<{ id: string; score: number }>> {
    if (q.scopeIds.length === 0) return [];
    const rows = await this.memories.aggregate(buildVectorSearchPipeline(p, q, opts.exact)).toArray();
    return rows.map((r) => ({ id: r._id as string, score: r.score as number }));
  }

  // ---- A4 ----
  supersede(): Promise<void> { throw new Error("A4: not implemented"); }
  tombstoneAndPurge(): Promise<{ tombstoneIds: string[] }> { throw new Error("A4: not implemented"); }
  expireDue(): Promise<string[]> { throw new Error("A4: not implemented"); }
  replayTombstones(): Promise<number> { throw new Error("A4: not implemented"); }
}
