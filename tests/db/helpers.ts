import { MongoClient, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import "../../src/db/dns.js";
import type { Memory, Principal } from "../../src/contracts/contracts.js";
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from "../../src/contracts/contracts.js";

export const HAS_ATLAS = !!process.env.MONGODB_URI;

export interface TestDb { db: Db; client: MongoClient; stop(): Promise<void> }

// Uses Atlas when MONGODB_URI is set (unique throwaway database per call),
// otherwise a local in-memory replica set (transactions work; $vectorSearch does not).
export async function startTestDb(): Promise<TestDb> {
  const dbName = `gml_test_${randomUUID().slice(0, 8)}`;
  if (HAS_ATLAS) {
    const client = await new MongoClient(process.env.MONGODB_URI!).connect();
    const db = client.db(dbName);
    return { db, client, stop: async () => { await db.dropDatabase(); await client.close(); } };
  }
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = await new MongoClient(rs.getUri()).connect();
  const db = client.db(dbName);
  return { db, client, stop: async () => { await client.close(); await rs.stop(); } };
}

export const principalA: Principal = { id: "alice", tenantId: "tenantA", role: "responder", scopes: ["team:tenantA", "private:alice"], purposes: ["incident-triage"] };
export const principalB: Principal = { id: "bob", tenantId: "tenantB", role: "responder", scopes: ["team:tenantB", "private:bob"], purposes: ["incident-triage"] };

export function unitVector(seed: number): number[] {
  const v = Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.sin(seed * 131 + i * 7.13));
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
}

export function makeMemory(over: Partial<Memory> = {}): Memory {
  const id = over._id ?? `mem_${randomUUID()}`;
  return {
    _id: id, tenantId: "tenantA", scopeId: "team:tenantA", purposeTags: ["incident-triage"],
    memoryType: "fix", claimKey: `claim/${id}`, text: "restart cache pool cp-7f3a",
    value: { action: "restart_cache_pool", pool: "cp-7f3a" },
    appliesTo: { service: "checkout-service", versionRange: ">=2.0.0", environment: "prod" },
    embedding: unitVector(1), embeddingModel: EMBEDDING_MODEL, contentHash: `h_${id}`,
    version: 1, derivedFrom: [], validFromMs: 0, expiresAtMs: 1_000_000, status: "active",
    confidence: 0.9, sourceAuthority: 0.8, source: { type: "incident", ref: "INC-1" },
    createdBy: "alice", createdAtMs: 0, policyVersion: "p1", ...over,
  };
}
