import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditStore, Principal } from "../contracts/contracts.js";

// Whitelist: only ids, hashes, decisions and reason codes are ever persisted (G15).
// Extra fields on the event (e.g. raw memory text) are dropped, never stored.
// A write failure throws so the calling operation fails closed.
export class MongoAuditStore implements AuditStore {
  constructor(private readonly db: Db) {}

  async record(e: AuditEvent): Promise<void> {
    await this.db.collection("audit").insertOne({
      _id: (e._id ?? `aud_${randomUUID()}`) as any,
      traceId: e.traceId, tenantId: e.tenantId, actorId: e.actorId, purpose: e.purpose, op: e.op,
      decision: e.decision, reasonCodes: e.reasonCodes, selectedIds: e.selectedIds,
      rejectedIds: e.rejectedIds.map((r) => ({ id: r.id, reason: r.reason })),
      queryHash: e.queryHash, createdAtMs: e.createdAtMs,
    });
  }

  /** Dashboard read: tenant-injected, newest first. */
  async list(p: Principal, limit: number): Promise<AuditEvent[]> {
    const rows = await this.db.collection("audit").find({ tenantId: p.tenantId }).sort({ createdAtMs: -1, _id: -1 }).limit(limit).toArray();
    return rows.map((r) => ({ ...r, _id: String(r._id) }) as unknown as AuditEvent);
  }
}
