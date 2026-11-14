import type { AuditEvent, AuditStore } from "../contracts/contracts";

export class FakeAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];
  private failing = false;

  setFailing(on: boolean): void {
    this.failing = on;
  }

  async record(e: AuditEvent): Promise<void> {
    if (this.failing) throw new Error("audit write failed");
    this.events.push(structuredClone(e));
  }
}
