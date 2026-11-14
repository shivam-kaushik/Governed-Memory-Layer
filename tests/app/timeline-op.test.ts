import { describe, expect, it } from "vitest";
import { buildSteps } from "../../src/app/timeline";
import type { TraceEvent } from "../../src/contracts/contracts";

const ev = (payload: Record<string, unknown>) => [{ step: "memory_written", payload }] as unknown as TraceEvent[];
const op = (payload: Record<string, unknown>) => buildSteps(ev(payload), []).find((s) => s.kind === "memory")?.op;

describe("memory step op (drives the chat cloud)", () => {
  it("active_write_is_saved", () => expect(op({ memoryId: "m1", status: "active" })).toBe("saved"));
  it("disputed_or_duplicate_write_is_updated", () => {
    expect(op({ memoryId: "m1", status: "disputed" })).toBe("updated");
    expect(op({ memoryId: "m1", status: "duplicate" })).toBe("updated");
  });
  it("forgotten_is_deleted", () => expect(op({ forgotten: ["m1"] })).toBe("deleted"));
  it("no_change_has_no_op", () => expect(op({ skipped: true, reason: "NOT_FIXED" })).toBeUndefined());
});
