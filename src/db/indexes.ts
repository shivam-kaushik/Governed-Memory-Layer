import type { Db } from "mongodb";

export const TRACE_TTL_SECONDS = 7 * 24 * 3600;

// Plan 4.3. TTL indexes are cleanup only; the read gate is expiresAtMs.
export async function ensureIndexes(db: Db): Promise<void> {
  const memories = db.collection("memories");
  await memories.createIndex({ tenantId: 1, scopeId: 1, status: 1, expiresAtMs: 1 }, { name: "tenant_scope_status_expiry" });
  await memories.createIndex({ claimKey: 1, tenantId: 1, scopeId: 1 }, { name: "claimKey_tenant_scope" });
  await memories.createIndex({ derivedFrom: 1 }, { name: "derivedFrom_1" });
  await memories.createIndex({ tenantId: 1, claimKey: 1, version: 1 }, { name: "unique_tenant_claimKey_version", unique: true });
  await memories.createIndex({ purgeAt: 1 }, { name: "purgeAt_ttl", expireAfterSeconds: 0 });

  await db.collection("audit").createIndex({ tenantId: 1, traceId: 1, createdAtMs: 1 }, { name: "audit_tenant_trace" });
  await db.collection("agent_traces").createIndex({ tenantId: 1, traceId: 1, createdAtMs: 1 }, { name: "trace_tenant_trace_time" });
  await db.collection("agent_traces").createIndex({ createdAt: 1 }, { name: "trace_ttl_7d", expireAfterSeconds: TRACE_TTL_SECONDS });
  await db.collection("tombstones").createIndex({ tenantId: 1, targetId: 1 }, { name: "tombstone_target" });
  await db.collection("tombstones").createIndex({ tenantId: 1, contentHash: 1 }, { name: "tombstone_hash" });
  await db.collection("eval_runs").createIndex({ scenarioId: 1, createdAtMs: 1 }, { name: "eval_scenario" });
}
