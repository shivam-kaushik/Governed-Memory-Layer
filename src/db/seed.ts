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

interface SeedSpec { id: string; tenantId: string; scopeId: string; claimKey: string; text: string; value: Record<string, unknown>; service: string; versionRange: string; createdBy: string }

const SEEDS: SeedSpec[] = [
  { id: "seed_a_team_fix", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "session-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on session-service: restart cache pool cp-7f3a", value: { action: "restart_cache_pool", pool: "cp-7f3a" }, service: "session-service", versionRange: ">=2.0.0", createdBy: "alice" },
  // Deliberately near-identical symptom text, different service: must survive forgetting the memory above.
  { id: "seed_a_similar_other_service", tenantId: "tenantA", scopeId: "team:tenantA", claimKey: "billing-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on billing-service: restart cache pool cp-1b9d", value: { action: "restart_cache_pool", pool: "cp-1b9d" }, service: "billing-service", versionRange: ">=2.0.0", createdBy: "alice" },
  { id: "seed_a_private_note", tenantId: "tenantA", scopeId: "private:alice", claimKey: "alice/pref/escalation", text: "alice prefers to escalate session incidents to the charger-ops oncall first", value: { escalate: "charger-ops" }, service: "session-service", versionRange: "*", createdBy: "alice" },
  { id: "seed_b_team_fix", tenantId: "tenantB", scopeId: "team:tenantB", claimKey: "session-service/5xx/cache", text: "charging sessions fail with 5xx after deploy on session-service: restart cache pool cp-9e41", value: { action: "restart_cache_pool", pool: "cp-9e41" }, service: "session-service", versionRange: ">=2.0.0", createdBy: "bob" },
];
export const SEED_MEMORY_IDS = SEEDS.map((s) => s.id);

export const SEED_COLLECTIONS = ["memories", "principals", "audit", "tombstones", "eval_runs", "agent_traces"] as const;

export async function seedAll(db: Db, embedder: Embedder, clock: Clock): Promise<void> {
  await db.collection("principals").insertMany(SEED_PRINCIPALS.map((p) => ({ ...p, _id: p.id as any })));
  const repo = new MongoMemoryRepo(db, clock);
  const now = clock.nowMs();
  for (const s of SEEDS) {
    const principal = SEED_PRINCIPALS.find((p) => p.tenantId === s.tenantId && p.id === s.createdBy)!;
    const doc: Memory = {
      _id: s.id, tenantId: s.tenantId, scopeId: s.scopeId, purposeTags: ["incident-triage"], memoryType: "fix",
      claimKey: s.claimKey, text: s.text, value: s.value,
      appliesTo: { service: s.service, versionRange: s.versionRange, environment: "prod" },
      embedding: await embedder.embed(s.text), embeddingModel: EMBEDDING_MODEL,
      contentHash: createHash("sha256").update(s.text).digest("hex"), version: 1, derivedFrom: [],
      validFromMs: now, expiresAtMs: now + 7 * DAY, status: "active", confidence: 0.9, sourceAuthority: 0.8,
      source: { type: "seed", ref: s.id }, createdBy: s.createdBy, createdAtMs: now, policyVersion: "p1",
    };
    await repo.insert(principal, doc);
  }
}

// Wipes data (indexes and validators stay) and restores the seed set. Used between demo runs.
export async function resetAll(db: Db, embedder: Embedder, clock: Clock): Promise<void> {
  await Promise.all(SEED_COLLECTIONS.map((c) => db.collection(c).deleteMany({})));
  await seedAll(db, embedder, clock);
}
