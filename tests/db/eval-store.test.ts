import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, HAS_ATLAS, type TestDb } from "./helpers.js";
import { bootstrap } from "../../src/db/bootstrap.js";
import { MongoEvalStore } from "../../src/db/mongo-eval-store.js";

let t: TestDb; let store: MongoEvalStore;
beforeAll(async () => { t = await startTestDb(); await bootstrap(t.db, { vectorIndex: HAS_ATLAS }); store = new MongoEvalStore(t.db); });
afterAll(async () => { await t.stop(); });

describe("A6 MongoEvalStore", () => {
  it("saves_and_lists_runs_per_scenario_in_time_order", async () => {
    await store.saveRun({ scenarioId: "s1", arm: "R", seed: 1, action: { tool: "investigate" }, scores: { ok: true }, createdAtMs: 20 });
    await store.saveRun({ scenarioId: "s1", arm: "O", seed: 1, action: { tool: "investigate" }, scores: { ok: false }, createdAtMs: 10 });
    await store.saveRun({ scenarioId: "s2", arm: "R", seed: 2, action: {}, scores: {}, createdAtMs: 5 });
    const runs = await store.listRuns("s1");
    expect(runs.map((r) => r.arm)).toEqual(["O", "R"]);
    expect(runs.every((r) => r.scenarioId === "s1")).toBe(true);
  });
});
