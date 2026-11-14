import type { MemoryOp, Principal, ReasonCode } from "../contracts/contracts";

export type AuthResult = { allowed: true } | { allowed: false; reason: ReasonCode };

const OPS: readonly string[] = ["recall", "remember", "correct", "forget", "promote"];
const deny = (reason: ReasonCode): AuthResult => ({ allowed: false, reason });

// scopeId is the target scope; for promote it is the destination team scope.
// Read permission never implies write: responders mutate private scope only.
export function authorize(p: Principal, op: MemoryOp, scopeId: string, purpose: string): AuthResult {
  if (!OPS.includes(op)) return deny("OP_DENIED");
  if (p.role !== "responder" && p.role !== "reviewer" && p.role !== "admin") return deny("OP_DENIED");
  if (!purpose || !p.purposes.includes(purpose)) return deny("PURPOSE_DENIED");
  if (!p.scopes.includes(scopeId)) return deny("SCOPE_DENIED");
  if (p.role === "responder") {
    if (op === "recall") return { allowed: true };
    if (op === "promote" || !scopeId.startsWith("private:")) return deny("OP_DENIED");
  }
  return { allowed: true };
}
