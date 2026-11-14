import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, makeMemory, principalA, principalB, HAS_ATLAS, type TestDb } from "../db/helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoMemoryRepo } from "../../src/db/mongo-memory-repo.js";

let t: TestDb; let repo: MongoMemoryRepo;
const aTeam = makeMemory({ claimKey: "t/a" });
const aPrivCarol = makeMemory({ claimKey: "t/c", scopeId: "private:carol" });
const bTeam = makeMemory({ claimKey: "t/b", tenantId: "tenantB", scopeId: "team:tenantB" });

beforeAll(async () => {
  t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); repo = new MongoMemoryRepo(t.db);
  await repo.insert(principalA, aTeam); await repo.insert(principalA, aPrivCarol); await repo.insert(principalB, bTeam);
});
afterAll(async () => { await t.stop(); });

describe("A6 forged identity (G1, G2)", () => {
  it("forged_tenant_in_doc_is_overwritten_by_principal_tenant", async () => {
    const forged = makeMemory({ tenantId: "tenantB", claimKey: "t/forged" });
    await repo.insert(principalA, forged);
    expect(await repo.getById(principalB, forged._id)).toBeNull();
    expect((await repo.getById(principalA, forged._id))?.tenantId).toBe("tenantA");
  });
  it("forged_tenant_in_filter_ignored_for_reads", async () => {
    expect(await repo.getById(principalA, bTeam._id)).toBeNull();
    expect(await repo.byIds(principalA, [bTeam._id, aTeam._id])).toHaveLength(1);
    expect(await repo.findActiveByClaimKey(principalA, ["team:tenantB"], "t/b")).toEqual([]);
  });
  it("reads_are_limited_to_the_principals_own_scopes", async () => {
    expect(await repo.getById(principalA, aPrivCarol._id)).toBeNull(); // alice cannot read carol's private memory
    expect((await repo.byIds(principalA, [aPrivCarol._id, aTeam._id])).map((m) => m._id)).toEqual([aTeam._id]);
    expect(await repo.findActiveByClaimKey(principalA, ["private:carol"], "t/c")).toEqual([]);
  });
  it("operator_injection_in_ids_and_claimKey_is_rejected", async () => {
    await expect(repo.getById(principalA, { $ne: null } as any)).rejects.toThrow(/string/i);
    await expect(repo.byIds(principalA, [{ $ne: null } as any])).rejects.toThrow(/string/i);
    await expect(repo.findActiveByClaimKey(principalA, ["team:tenantA"], { $ne: null } as any)).rejects.toThrow(/string/i);
    await expect(repo.findActiveByClaimKey(principalA, [{ $ne: null } as any], "t/a")).rejects.toThrow(/string/i);
    await expect(repo.findDerived(principalA, { $ne: null } as any)).rejects.toThrow(/string/i);
    await expect(repo.isTombstoned(principalA, { $ne: null } as any)).rejects.toThrow(/string/i);
  });
  it("principal_without_tenant_fails_closed", async () => {
    await expect(repo.getById({ ...principalA, tenantId: "" }, aTeam._id)).rejects.toThrow(/principal/i);
    await expect(repo.byIds(undefined as any, [aTeam._id])).rejects.toThrow(/principal/i);
  });
});
