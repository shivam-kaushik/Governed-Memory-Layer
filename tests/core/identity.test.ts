import { describe, expect, it } from "vitest";
import { resolvePrincipal } from "../../src/core/identity";

const good = {
  id: "a-resp",
  tenantId: "tenant-a",
  role: "responder",
  scopes: ["team:tenant-a", "private:a-resp"],
  purposes: ["incident-triage"],
};

describe("resolvePrincipal (fail closed)", () => {
  it("returns a validated principal for a known token", async () => {
    expect(await resolvePrincipal(async () => good, "tok")).toEqual(good);
  });

  it("strips unknown fields from the resolved principal", async () => {
    const p = await resolvePrincipal(async () => ({ ...good, isAdmin: true }), "tok");
    expect(p).toEqual(good);
  });

  it("returns null for an unknown token", async () => {
    expect(await resolvePrincipal(async () => null, "tok")).toBeNull();
  });

  it("returns null when the resolver throws", async () => {
    expect(await resolvePrincipal(async () => { throw new Error("db down"); }, "tok")).toBeNull();
  });

  it.each([
    ["empty token", "", good],
    ["bad role", "tok", { ...good, role: "superuser" }],
    ["empty tenantId", "tok", { ...good, tenantId: "" }],
    ["foreign team scope", "tok", { ...good, scopes: ["team:tenant-b"] }],
    ["foreign private scope", "tok", { ...good, scopes: ["private:someone-else"] }],
    ["no purposes", "tok", { ...good, purposes: [] }],
    ["not an object", "tok", "admin"],
  ])("returns null for %s", async (_n, token, principal) => {
    expect(await resolvePrincipal(async () => principal, token)).toBeNull();
  });
});
