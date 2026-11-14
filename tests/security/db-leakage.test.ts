import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, makeMemory, unitVector, principalA, principalB, HAS_ATLAS, type TestDb } from "../db/helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { waitForIndexReady, VECTOR_INDEX_NAME } from "../../src/db/vector-index.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";
import { MongoEvalStore } from "../../src/db/mongo-eval-store.js";
import type { Memory, Principal } from "../../src/contracts/contracts.js";

const TRIALS = 300;
const dave: Principal = { id: "dave", tenantId: "tenantA", role: "responder", scopes: ["team:tenantA", "private:dave"], purposes: ["incident-triage"] };

// Deterministic PRNG so a failing trial is reproducible.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let t: TestDb; let repo: MongoMemoryRepo; let evals: MongoEvalStore;
const docs: Memory[] = [];
const canary = { b: [] as string[], carolPriv: [] as string[], alicePriv: [] as string[], davePriv: [] as string[], aTeam: [] as string[] };

beforeAll(async () => {
  t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS });
  repo = new MongoMemoryRepo(t.db); evals = new MongoEvalStore(t.db);
  const add = async (p: Principal, k: keyof typeof canary, scopeId: string, tenantId: string, i: number) => {
    const c = `CANARY-${k}-${i}-${Math.floor(i * 7919)}`; canary[k].push(c);
    const m = makeMemory({ tenantId, scopeId, text: c, claimKey: `leak/${k}/${i}`, embedding: unitVector(i + (k === "b" ? 1000 : 0)), expiresAtMs: 9_000_000_000_000 });
    docs.push(m); await repo.insert(p, m);
  };
  for (let i = 0; i < 6; i++) {
    await add(principalB, "b", "team:tenantB", "tenantB", i);
    await add(principalA, "carolPriv", "private:carol", "tenantA", i);
    await add(principalA, "alicePriv", "private:alice", "tenantA", i);
    await add(principalA, "davePriv", "private:dave", "tenantA", i);
    await add(principalA, "aTeam", "team:tenantA", "tenantA", i);
  }
  if (HAS_ATLAS) await waitForIndexReady(t.db, VECTOR_INDEX_NAME, 240_000);
}, 600_000);
afterAll(async () => { await t.stop(); });

describe("A6 db leakage", () => {
  it(`db_leakage_${TRIALS}_trials`, async () => {
    const rand = rng(20260607);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    let leaks = 0;
    for (let trial = 0; trial < TRIALS; trial++) {
      const p = pick([principalA, dave]);
      const forbidden = [
        ...canary.b, ...canary.carolPriv,
        ...(p.id === "alice" ? canary.davePriv : canary.alicePriv),
      ];
      const ids = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => pick(docs)._id);
      const forgedScopes = ["team:tenantB", "private:carol", "private:alice", "private:dave", "team:tenantA"].filter(() => rand() < 0.6);
      const claim = pick(docs).claimKey;
      const results: unknown[] = [await repo.byIds(p, ids), await repo.findActiveByClaimKey(p, forgedScopes, claim)];
      for (const id of ids) results.push(await repo.getById(p, id));
      if (HAS_ATLAS) results.push(await repo.vectorSearch(p, { vector: unitVector(Math.floor(rand() * 2000)), scopeIds: forgedScopes, nowMs: 1000, limit: 10 }));
      const dump = JSON.stringify(results);
      const foreignIds = docs.filter((d) => d.tenantId !== p.tenantId || (d.scopeId.startsWith("private:") && !p.scopes.includes(d.scopeId))).map((d) => d._id);
      if (forbidden.some((c) => dump.includes(c)) || foreignIds.some((id) => dump.includes(id))) leaks++;
    }
    await evals.saveRun({ scenarioId: "scorecard/db-leakage", arm: "R", seed: 20260607, action: {}, scores: { leaks, trials: TRIALS }, createdAtMs: 0 });
    console.log(`leaks: ${leaks}/${TRIALS}`);
    expect(leaks).toBe(0);
  }, 120_000);

  it("scorecard_row_is_persisted", async () => {
    const runs = await evals.listRuns("scorecard/db-leakage");
    expect(runs.at(-1)?.scores).toEqual({ leaks: 0, trials: TRIALS });
  });
});
