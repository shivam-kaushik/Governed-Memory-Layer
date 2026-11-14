import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditStore } from "../contracts/contracts.js";

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
}
