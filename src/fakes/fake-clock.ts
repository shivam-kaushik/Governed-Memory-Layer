import type { Clock } from "../contracts/contracts";

export class FakeClock implements Clock {
  constructor(private t: number) {}
  nowMs(): number {
    return this.t;
  }
  advanceMs(ms: number): void {
    this.t += ms;
  }
}
