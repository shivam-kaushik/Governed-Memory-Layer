import type { Memory, MemoryRepo, MemoryStatus, Principal } from "../contracts/contracts";

interface Tombstone {
  tenantId: string;
  targetId: string;
  contentHash: string;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
const copy = (m: Memory): Memory => structuredClone(m);

// In-memory stand-in for Person A's Mongo repo. Mirrors tenant injection,
// status/expiry gates, tombstones and unique (tenantId, claimKey, version).
export class FakeMemoryRepo implements MemoryRepo {
  private docs = new Map<string, Memory>(); // key: tenantId|id
  private tombs: Tombstone[] = [];
  private lag = false;

  private key = (tenantId: string, id: string) => `${tenantId}|${id}`;
  private tenantDocs(p: Principal): Memory[] {
    return [...this.docs.values()].filter((d) => d.tenantId === p.tenantId);
  }

  /** Test hook: vector index is stale, so it ignores status/validity filters. */
  setIndexLag(on: boolean): void {
    this.lag = on;
  }

  /** Test hook: simulates a backup restore that bypasses all guards. */
  restoreForTest(doc: Memory): void {
    this.docs.set(this.key(doc.tenantId, doc._id), copy(doc));
  }

  private blockedByTombstone(tenantId: string, id: string, hash: string): boolean {
    return this.tombs.some((t) => t.tenantId === tenantId && (t.targetId === id || (t.contentHash !== "" && t.contentHash === hash)));
  }

  private assertInsertable(p: Principal, doc: Memory): void {
    if (doc.tenantId !== p.tenantId) throw new Error("tenant mismatch");
    if (this.blockedByTombstone(p.tenantId, doc._id, doc.contentHash)) throw new Error("tombstoned");
    if (this.docs.has(this.key(p.tenantId, doc._id))) throw new Error("duplicate id");
    const dup = this.tenantDocs(p).some((d) => d.claimKey === doc.claimKey && d.version === doc.version);
    if (dup) throw new Error("duplicate (tenantId, claimKey, version)");
  }

  async insert(p: Principal, doc: Memory): Promise<void> {
    this.assertInsertable(p, doc);
    this.docs.set(this.key(p.tenantId, doc._id), copy(doc));
  }

  async getById(p: Principal, id: string): Promise<Memory | null> {
    const d = this.docs.get(this.key(p.tenantId, id));
    return d && d.status !== "deleted" ? copy(d) : null;
  }

  async byIds(p: Principal, ids: string[]): Promise<Memory[]> {
    const out: Memory[] = [];
    for (const id of ids) {
      const d = await this.getById(p, id);
      if (d) out.push(d);
    }
    return out;
  }

  async findActiveByClaimKey(p: Principal, scopeIds: string[], claimKey: string): Promise<Memory[]> {
    return this.tenantDocs(p)
      .filter((d) => d.claimKey === claimKey && d.status === "active" && scopeIds.includes(d.scopeId))
      .map(copy);
  }

  async vectorSearch(
    p: Principal,
    q: { vector: number[]; scopeIds: string[]; nowMs: number; limit: number },
  ): Promise<Array<{ id: string; score: number }>> {
    return this.tenantDocs(p)
      .filter((d) => q.scopeIds.includes(d.scopeId))
      .filter((d) => this.lag || (d.status === "active" && d.validFromMs <= q.nowMs && q.nowMs < d.expiresAtMs))
      .map((d) => ({ id: d._id, score: dot(q.vector, d.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, q.limit);
  }

  async setStatus(p: Principal, id: string, status: MemoryStatus): Promise<void> {
    const d = this.docs.get(this.key(p.tenantId, id));
    if (!d) throw new Error("not found");
    d.status = status;
  }

  async supersede(p: Principal, oldId: string, newDoc: Memory): Promise<void> {
    const old = this.docs.get(this.key(p.tenantId, oldId));
    if (!old || old.status === "deleted") throw new Error("not found");
    this.assertInsertable(p, newDoc); // validate everything before mutating: atomic
    old.status = "superseded";
    this.docs.set(this.key(p.tenantId, newDoc._id), copy(newDoc));
  }

  async findDerived(p: Principal, id: string): Promise<string[]> {
    return this.tenantDocs(p)
      .filter((d) => d.status !== "deleted" && d.derivedFrom.includes(id))
      .map((d) => d._id);
  }

  async tombstoneAndPurge(p: Principal, ids: string[], _reason: string): Promise<{ tombstoneIds: string[] }> {
    const tombstoneIds: string[] = [];
    for (const id of ids) {
      const d = this.docs.get(this.key(p.tenantId, id));
      this.tombs.push({ tenantId: p.tenantId, targetId: id, contentHash: d?.contentHash ?? "" });
      this.docs.delete(this.key(p.tenantId, id));
      tombstoneIds.push(`tomb-${this.tombs.length}`);
    }
    return { tombstoneIds };
  }

  async isTombstoned(p: Principal, id: string, contentHash?: string): Promise<boolean> {
    return this.blockedByTombstone(p.tenantId, id, contentHash ?? "");
  }

  async expireDue(nowMs: number): Promise<string[]> {
    const out: string[] = [];
    for (const d of this.docs.values()) {
      if (d.status === "active" && d.expiresAtMs <= nowMs) {
        d.status = "expired";
        out.push(d._id);
      }
    }
    return out;
  }

  async replayTombstones(): Promise<number> {
    let n = 0;
    for (const [k, d] of [...this.docs]) {
      if (this.blockedByTombstone(d.tenantId, d._id, d.contentHash)) {
        this.docs.delete(k);
        n++;
      }
    }
    return n;
  }
}
