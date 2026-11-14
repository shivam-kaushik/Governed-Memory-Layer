import { describe, expect, it } from "vitest";
import { createMemoryLayer } from "../../src/core";
import { DAY, caller, fixInput, query, setup } from "./helpers";

describe("createMemoryLayer", () => {
  it("wires remember, recall, correct, promote and forget to the core ops", async () => {
    const { deps } = setup();
    const layer = createMemoryLayer(deps);
    const mine = await layer.remember(fixInput() as never, caller("tok-rev"));
    expect((await layer.recall(query(), caller("tok-rev"))).cards.map((c) => c.memoryId)).toEqual([mine.id]);

    const promoted = await layer.promote(mine.id, caller("tok-rev"));
    const fixed = await layer.correct(promoted.newId, { reason: "r", ttlMs: 2 * DAY }, caller("tok-rev"));
    expect(fixed.supersedes).toBe(promoted.newId);

    const gone = await layer.forget(mine.id, "r", caller("tok-rev"));
    expect(gone.cascadedIds.length).toBeGreaterThan(0); // the promoted copy derives from the private source
    expect((await layer.recall(query(), caller("tok-rev"))).cards).toEqual([]);
  });
});
