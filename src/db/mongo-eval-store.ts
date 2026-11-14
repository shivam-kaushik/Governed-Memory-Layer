import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";
import type { EvalRun, EvalStore } from "../contracts/contracts.js";

// Proof-harness results and scorecard rows (e.g. scenarioId "scorecard/db-leakage" -> leaks 0/300).
export class MongoEvalStore implements EvalStore {
  constructor(private readonly db: Db) {}

  async saveRun(r: EvalRun): Promise<void> {
    await this.db.collection("eval_runs").insertOne({
      _id: (r._id ?? `run_${randomUUID()}`) as any,
      scenarioId: r.scenarioId, arm: r.arm, seed: r.seed, action: r.action, scores: r.scores, createdAtMs: r.createdAtMs,
    });
  }

  async listRuns(scenarioId: string): Promise<EvalRun[]> {
    if (typeof scenarioId !== "string") throw new Error("scenarioId must be a string");
    const rows = await this.db.collection("eval_runs").find({ scenarioId }).sort({ createdAtMs: 1, _id: 1 }).toArray();
    return rows.map((d) => ({ _id: String(d._id), scenarioId: d.scenarioId, arm: d.arm, seed: d.seed, action: d.action, scores: d.scores, createdAtMs: d.createdAtMs }));
  }
}
