import { describe, expect, it } from "vitest";
import type { Principal } from "../../src/contracts/contracts";
import { authorize } from "../../src/core/policy";

const mk = (role: Principal["role"]): Principal => ({
  id: "u1",
  tenantId: "t1",
  role,
  scopes: ["team:t1", "private:u1"],
  purposes: ["incident-triage"],
});
const TEAM = "team:t1";
const PRIV = "private:u1";
const P = "incident-triage";

// [role, op, scope, allowed]
const table: Array<[Principal["role"], "recall" | "remember" | "correct" | "forget" | "promote", string, boolean]> = [
  ["responder", "recall", PRIV, true],
  ["responder", "recall", TEAM, true],
  ["responder", "remember", PRIV, true],
  ["responder", "remember", TEAM, false], // sharing to team is promote()
  ["responder", "correct", PRIV, true],
  ["responder", "correct", TEAM, false],
  ["responder", "forget", PRIV, true],
  ["responder", "forget", TEAM, false],
  ["responder", "promote", TEAM, false],
  ["reviewer", "recall", TEAM, true],
  ["reviewer", "remember", TEAM, true],
  ["reviewer", "correct", TEAM, true],
  ["reviewer", "forget", TEAM, true],
  ["reviewer", "promote", TEAM, true],
  ["admin", "remember", TEAM, true],
  ["admin", "forget", TEAM, true],
  ["admin", "promote", TEAM, true],
];

describe("authorize: role x op x scope", () => {
  it.each(table)("%s %s %s -> %s", (role, op, scope, allowed) => {
    const r = authorize(mk(role), op, scope, P);
    expect(r.allowed).toBe(allowed);
    if (!allowed) expect(r).toMatchObject({ reason: "OP_DENIED" });
  });
});

describe("authorize: fail closed", () => {
  it("denies a scope the principal does not hold (SCOPE_DENIED)", () => {
    expect(authorize(mk("admin"), "recall", "team:other", P)).toEqual({ allowed: false, reason: "SCOPE_DENIED" });
    expect(authorize(mk("admin"), "recall", "private:someone-else", P)).toEqual({ allowed: false, reason: "SCOPE_DENIED" });
  });

  it("denies a purpose the principal does not hold (PURPOSE_DENIED)", () => {
    expect(authorize(mk("admin"), "recall", TEAM, "marketing")).toEqual({ allowed: false, reason: "PURPOSE_DENIED" });
    expect(authorize(mk("admin"), "recall", TEAM, "")).toEqual({ allowed: false, reason: "PURPOSE_DENIED" });
  });

  it("denies unknown ops and unknown roles", () => {
    expect(authorize(mk("admin"), "drop_table" as never, TEAM, P).allowed).toBe(false);
    expect(authorize({ ...mk("admin"), role: "root" as never }, "recall", TEAM, P).allowed).toBe(false);
  });
});
