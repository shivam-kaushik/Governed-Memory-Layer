import type { ReasonCode } from "../contracts/contracts";

// Thrown by core ops. Message is the reason code only: never raw memory text.
export class GovernanceError extends Error {
  constructor(
    public readonly code: ReasonCode,
    public readonly traceId: string,
  ) {
    super(code);
    this.name = "GovernanceError";
  }
}
