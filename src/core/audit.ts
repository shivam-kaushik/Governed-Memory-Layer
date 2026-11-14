import { createHash } from "node:crypto";
import type { Caller, Decision, MemoryOp, Principal, ReasonCode } from "../contracts/contracts";
import type { CoreDeps } from "./deps";
import { GovernanceError } from "./errors";
import { resolvePrincipal } from "./identity";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Per-operation helpers. Audit rows hold ids, hashes and reason codes only (G15).
export function opContext(deps: CoreDeps, op: MemoryOp, caller: Caller, hashSource: unknown) {
  const traceId = deps.newId("tr");
  let queryHash: string;
  try {
    queryHash = sha256(JSON.stringify(hashSource) ?? "");
  } catch {
    queryHash = sha256("unserializable");
  }

  const audit = (
    p: Principal | null,
    decision: Decision,
    reasonCodes: ReasonCode[],
    selectedIds: string[] = [],
    rejectedIds: { id: string; reason: ReasonCode }[] = [],
  ) =>
    deps.audit.record({
      _id: deps.newId("aud"),
      traceId,
      tenantId: p?.tenantId ?? "unknown",
      actorId: p?.id ?? "unknown",
      purpose: caller.purpose,
      op,
      decision,
      reasonCodes,
      selectedIds,
      rejectedIds,
      queryHash,
      createdAtMs: deps.clock.nowMs(),
    });

  const refuse = async (p: Principal | null, code: ReasonCode): Promise<never> => {
    await audit(p, "deny", [code]);
    throw new GovernanceError(code, traceId);
  };

  // Unknown principal or purpose not held: audited deny, thrown.
  const authenticate = async (): Promise<Principal> => {
    const p = await resolvePrincipal(deps.resolvePrincipal, caller.sessionToken);
    if (!p) return refuse(null, "UNKNOWN_PRINCIPAL");
    if (!p.purposes.includes(caller.purpose)) return refuse(p, "PURPOSE_DENIED");
    return p;
  };

  return { traceId, audit, refuse, authenticate };
}
