import type { AuditEvent, AuditStore, Principal } from "../contracts/contracts";

export class FakeAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];
  private failing = false;

  setFailing(on: boolean): void {
    this.failing = on;
  }

  /** Dashboard read: tenant-injected, newest first. */
  async list(p: Principal, limit: number): Promise<AuditEvent[]> {
    return this.events
      .filter((e) => e.tenantId === p.tenantId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  async record(e: AuditEvent): Promise<void> {
    if (this.failing) throw new Error("audit write failed");
    this.events.push(structuredClone(e));
  }
}
