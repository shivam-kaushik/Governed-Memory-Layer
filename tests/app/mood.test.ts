import { describe, expect, it } from "vitest";
import { moodForOp, replyOp } from "../../src/app/mood";

describe("mascot mood", () => {
  it("memory_ops_map_to_moods", () => {
    expect(moodForOp("saved")).toBe("saved");
    expect(moodForOp("updated")).toBe("updated");
    expect(moodForOp("deleted")).toBe("deleted");
    expect(moodForOp(undefined)).toBe("idle");
  });
  it("reply_op_is_the_first_memory_change_in_any_turn", () => {
    expect(replyOp({ steps: [{ op: "deleted" }] })).toBe("deleted");
    expect(replyOp({ turns: [{ steps: [{}] }, { steps: [{ op: "saved" }] }] })).toBe("saved");
    expect(replyOp({ steps: [{}] })).toBeUndefined();
    expect(replyOp({})).toBeUndefined();
  });
});
