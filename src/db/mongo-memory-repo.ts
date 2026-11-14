import type { Db, Collection } from "mongodb";
import type { Memory, MemoryRepo, Principal } from "../contracts/contracts.js";

// Grace period between expiry and the TTL cleanup index removing the doc.
export const PURGE_GRACE_MS = 7 * 24 * 3600 * 1000;

// tenantId always comes from the Principal argument, never from a doc or filter the caller built (G1, G3).
export function derivedQuery(p: Principal, id: string) {
  return { filter: { tenantId: p.tenantId, derivedFrom: id }, hint: "derivedFrom_1" };
}

export class MongoMemoryRepo implements MemoryRepo {
  protected readonly memories: Collection<any>;
  protected readonly tombstones: Collection<any>;

  constructor(protected readonly db: Db) {
    this.memories = db.collection("memories");
    this.tombstones = db.collection("tombstones");
  }

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

  // ---- A3 / A4 ----
  vectorSearch(): Promise<Array<{ id: string; score: number }>> { throw new Error("A3: not implemented"); }
  supersede(): Promise<void> { throw new Error("A4: not implemented"); }
  tombstoneAndPurge(): Promise<{ tombstoneIds: string[] }> { throw new Error("A4: not implemented"); }
  expireDue(): Promise<string[]> { throw new Error("A4: not implemented"); }
  replayTombstones(): Promise<number> { throw new Error("A4: not implemented"); }
}
