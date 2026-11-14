import { describe, expect, it } from "vitest";
import { ruleBrain } from "../../src/agent/brain-rules";
import { buildWorld } from "./helpers";

describe("triage outcome exposes the recalled evidence", () => {
  it("outcome_cards_are_the_recalled_cards_for_a_valid_fix", async () => {
    const w = await buildWorld("valid_fix", 1);
    const o = await w.run(ruleBrain);
    expect(o.cards.length).toBe(1);
    expect(o.cards[0]!.memoryId).toBe(o.action.usedMemoryIds[0]);
    expect(o.cards[0]!.statement).toContain(w.scenario.nonce);
  });
  it("outcome_cards_are_empty_when_nothing_is_eligible", async () => {
    const w = await buildWorld("expired_fix", 1);
    expect((await w.run(ruleBrain)).cards).toEqual([]);
  });
});
