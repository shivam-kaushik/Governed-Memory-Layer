import type { Db, Collection } from "mongodb";
import { randomUUID } from "node:crypto";
import type { Clock, Memory, MemoryRepo, Principal } from "../contracts/contracts.js";
import { systemClock } from "./system-clock.js";
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
  constructor(protected readonly db: Db, protected readonly clock: Clock = systemClock) {}

  protected get memories(): Collection<any> { return this.db.collection("memories"); }
  protected get tombstones(): Collection<any> { return this.db.collection("tombstones"); }

  async insert(p: Principal, doc: Memory): Promise<void> {
    if (await this.isTombstoned(p, doc._id, doc.contentHash)) throw new Error("TOMBSTONED: id or content was forgotten");
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

  // ---- A4: lifecycle persistence ----

  // Old doc -> superseded and new doc inserted in ONE transaction (all or nothing).
  async supersede(p: Principal, oldId: string, newDoc: Memory): Promise<void> {
    const session = this.db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const res = await this.memories.updateOne(
          { _id: oldId, tenantId: p.tenantId, status: { $in: ["active", "disputed"] } },
          { $set: { status: "superseded" } },
          { session },
        );
        if (res.matchedCount !== 1) throw new Error("SUPERSEDE_TARGET_NOT_FOUND");
        await this.memories.insertOne(
          { ...newDoc, tenantId: p.tenantId, supersedes: oldId, purgeAt: new Date(newDoc.expiresAtMs + PURGE_GRACE_MS) },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  // Tombstone (id + content hash only) first, then delete content and embedding, in ONE transaction.
  async tombstoneAndPurge(p: Principal, ids: string[], reason: string): Promise<{ tombstoneIds: string[] }> {
    const tombstoneIds: string[] = [];
    const session = this.db.client.startSession();
    try {
      await session.withTransaction(async () => {
        tombstoneIds.length = 0;
        for (const id of ids) {
          const doc = await this.memories.findOne({ _id: id, tenantId: p.tenantId }, { session, projection: { contentHash: 1 } });
          const tombId = `tomb_${randomUUID()}`;
          await this.tombstones.insertOne({
            _id: tombId, tenantId: p.tenantId, targetId: id, contentHash: doc?.contentHash,
            requestedBy: p.id, reason, createdAtMs: this.clock.nowMs(),
            closure: { derivedIds: ids.filter((x) => x !== id), status: "verified" },
          }, { session });
          await this.memories.deleteOne({ _id: id, tenantId: p.tenantId }, { session });
          tombstoneIds.push(tombId);
        }
      });
    } finally {
      await session.endSession();
    }
    return { tombstoneIds };
  }

  // Cleanup/status flip only; the read-time gate (expiresAtMs) never depends on this running.
  async expireDue(nowMs: number): Promise<string[]> {
    const due = await this.memories.find({ status: "active", expiresAtMs: { $lte: nowMs } }, { projection: { _id: 1 } }).toArray();
    const ids = due.map((d) => d._id as string);
    if (ids.length) await this.memories.updateMany({ _id: { $in: ids }, status: "active" }, { $set: { status: "expired" } });
    return ids;
  }

  // After any restore/import: re-delete anything a tombstone says must stay gone (G14).
  async replayTombstones(): Promise<number> {
    let removed = 0;
    for await (const t of this.tombstones.find({})) {
      const or: object[] = [{ _id: t.targetId }];
      if (t.contentHash) or.push({ contentHash: t.contentHash });
      removed += (await this.memories.deleteMany({ tenantId: t.tenantId, $or: or })).deletedCount;
    }
    return removed;
  }
}
