import type { Db } from "mongodb";
import type { Clock, Embedder, Memory, Principal } from "../contracts/contracts.js";
import { EMBEDDING_MODEL } from "../contracts/contracts.js";
import { MongoMemoryRepo } from "./mongo-memory-repo.js";
import { createHash } from "node:crypto";

const DAY = 24 * 3600 * 1000;

export const SEED_PRINCIPALS: Principal[] = [
  { id: "alice", tenantId: "tenantA", role: "responder", scopes: ["team:tenantA", "private:alice"], purposes: ["incident-triage"] },
  { id: "rita", tenantId: "tenantA", role: "reviewer", scopes: ["team:tenantA", "private:rita"], purposes: ["incident-triage"] },
  { id: "bob", tenantId: "tenantB", role: "responder", scopes: ["team:tenantB", "private:bob"], purposes: ["incident-triage"] },
];

interface SeedSpec { id: string; tenantId: string; scopeId: string; claimKey: string; text: string; value: Record<string, unknown>; service: string; versionRange: string; createdBy: string; memoryType?: Memory["memoryType"]; ttlDays?: number; confidence?: number }

const SEEDS: SeedSpec[] = [
  { id: "seed_a_team_fix", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "session-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on session-service: restart cache pool cp-7f3a", value: { action: "restart_cache_pool", pool: "cp-7f3a" }, service: "session-service", versionRange: ">=2.0.0", createdBy: "alice" },
  // Deliberately near-identical symptom text, different service: must survive forgetting the memory above.
  { id: "seed_a_similar_other_service", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "billing-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on billing-service: restart cache pool cp-1b9d", value: { action: "restart_cache_pool", pool: "cp-1b9d" }, service: "billing-service", versionRange: ">=2.0.0", createdBy: "alice" },
  { id: "seed_a_private_note", tenantId: "tenantA", scopeId: "private:alice", claimKey: "alice/pref/escalation", text: "alice prefers to escalate session incidents to the charger-ops oncall first", value: { escalate: "charger-ops" }, service: "session-service", versionRange: "*", createdBy: "alice" },
  { id: "seed_b_team_fix", tenantId: "tenantB", scopeId: "team:tenantB", claimKey: "session-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on session-service: restart cache pool cp-9e41", value: { action: "restart_cache_pool", pool: "cp-9e41" }, service: "session-service", versionRange: ">=2.0.0", createdBy: "bob" },
  // More EcoCharge history: how past incidents were resolved. Different fix kinds, a version-bound legacy fix, a playbook and private notes.
  { id: "seed_a_rollback_roaming", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "roaming-service/handshake/rollback", text: "partner roaming handshakes fail after deploy 2.4.0 on roaming-service: roll back to 2.3.8", value: { action: "rollback_deploy", version: "2.3.8" }, service: "roaming-service", versionRange: ">=2.4.0 <2.5.0", createdBy: "alice" },
  { id: "seed_a_scale_payments", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "payments-service/latency/peak", text: "payment authorizations time out during the evening charging peak on payments-service: scale to 8 replicas", value: { action: "scale_service", replicas: 8 }, service: "payments-service", versionRange: ">=1.0.0", createdBy: "alice" },
  { id: "seed_a_gateway_pool", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "charger-gateway-service/sync/cache", text: "charger firmware sync storm saturates the cache on charger-gateway-service: restart cache pool cp-5c21", value: { action: "restart_cache_pool", pool: "cp-5c21" }, service: "charger-gateway-service", versionRange: ">=4.0.0", createdBy: "alice" },
  // Legacy fix bound to old versions: must be rejected (WRONG_VERSION) for a 3.x alert.
  { id: "seed_a_session_legacy", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "session-service/5xx/cache/legacy", text: "charging sessions fail with 5xx after deploy on legacy session-service 2.x: restart cache pool cp-2d90", value: { action: "restart_cache_pool", pool: "cp-2d90" }, service: "session-service", versionRange: "<3.0.0", confidence: 0.6, createdBy: "alice" },
  { id: "seed_a_playbook_5xx", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "playbook/5xx-after-deploy", text: "Playbook for 5xx after a deploy: check the cache tier first, restart the saturated pool, and roll back only if that does not fix it within 10 minutes", value: { steps: ["check the cache tier", "restart the saturated pool", "roll back if unfixed after 10 minutes"] }, service: "session-service", versionRange: "*", memoryType: "playbook", ttlDays: 60, createdBy: "alice" },
  { id: "seed_a_rita_pref", tenantId: "tenantA", scopeId: "private:rita", claimKey: "rita/pref/rollback", text: "rita prefers rolling back over restarting for roaming-service incidents", value: { prefer: "rollback" }, service: "roaming-service", versionRange: "*", memoryType: "preference", ttlDays: 365, createdBy: "rita" },
  // Another client: same services, different resolutions. Must never surface for EcoCharge.
  { id: "seed_b_rollback_roaming", tenantId: "tenantB", scopeId: "team:tenantB", claimKey: "roaming-service/handshake/rollback", text: "partner roaming handshakes fail after deploy 2.4.0 on roaming-service: roll back to 2.3.5", value: { action: "rollback_deploy", version: "2.3.5" }, service: "roaming-service", versionRange: ">=2.4.0 <2.5.0", createdBy: "bob" },
  { id: "seed_b_billing_pool", tenantId: "tenantB", scopeId: "team:tenantB", claimKey: "billing-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on billing-service: restart cache pool cp-b7d2", value: { action: "restart_cache_pool", pool: "cp-b7d2" }, service: "billing-service", versionRange: ">=1.0.0", createdBy: "bob" },
  { id: "seed_b_bob_pref", tenantId: "tenantB", scopeId: "private:bob", claimKey: "bob/pref/vendor", text: "bob pages vendor support before rolling back any deploy", value: { escalate: "vendor-support" }, service: "roaming-service", versionRange: "*", memoryType: "preference", ttlDays: 365, createdBy: "bob" },
];
export const SEED_MEMORY_IDS = SEEDS.map((s) => s.id);

export const SEED_COLLECTIONS = ["memories", "principals", "audit", "tombstones", "eval_runs", "agent_traces"] as const;

async function insertSeeds(db: Db, embedder: Embedder, clock: Clock, specs: SeedSpec[]): Promise<void> {
  const repo = new MongoMemoryRepo(db, clock);
  const now = clock.nowMs();
  for (const s of specs) {
    const principal = SEED_PRINCIPALS.find((p) => p.tenantId === s.tenantId && p.id === s.createdBy)!;
    const doc: Memory = {
      _id: s.id, tenantId: s.tenantId, scopeId: s.scopeId, purposeTags: ["incident-triage"], memoryType: s.memoryType ?? "fix",
      claimKey: s.claimKey, text: s.text, value: s.value,
      appliesTo: { service: s.service, versionRange: s.versionRange, environment: "prod" },
      embedding: await embedder.embed(s.text), embeddingModel: EMBEDDING_MODEL,
      contentHash: createHash("sha256").update(s.text).digest("hex"), version: 1, derivedFrom: [],
      validFromMs: now, expiresAtMs: now + (s.ttlDays ?? 7) * DAY, status: "active", confidence: s.confidence ?? 0.9, sourceAuthority: 0.8,
      source: { type: "seed", ref: s.id }, createdBy: s.createdBy, createdAtMs: now, policyVersion: "p1",
    };
    await repo.insert(principal, doc);
  }
}

export async function seedAll(db: Db, embedder: Embedder, clock: Clock): Promise<void> {
  await db.collection("principals").insertMany(SEED_PRINCIPALS.map((p) => ({ ...p, _id: p.id as any })));
  await insertSeeds(db, embedder, clock, SEEDS);
}

// Adds only the seed memories that are missing, leaving everything else (audit, traces, learned memories) alone.
export async function seedMissing(db: Db, embedder: Embedder, clock: Clock): Promise<string[]> {
  const have = new Set((await db.collection("memories").find({ _id: { $in: SEED_MEMORY_IDS as any[] } }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
  const missing = SEEDS.filter((s) => !have.has(s.id));
  await insertSeeds(db, embedder, clock, missing);
  return missing.map((s) => s.id);
}

// Wipes data (indexes and validators stay) and restores the seed set. Used between demo runs.
export async function resetAll(db: Db, embedder: Embedder, clock: Clock): Promise<void> {
  await Promise.all(SEED_COLLECTIONS.map((c) => db.collection(c).deleteMany({})));
  await seedAll(db, embedder, clock);
}
