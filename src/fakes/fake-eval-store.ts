import type { EvalRun, EvalStore } from "../contracts/contracts";

export class FakeEvalStore implements EvalStore {
  private runs: EvalRun[] = [];

  async saveRun(r: EvalRun): Promise<void> {
    this.runs.push(structuredClone(r));
  }

  async listRuns(scenarioId: string): Promise<EvalRun[]> {
    return this.runs.filter((r) => r.scenarioId === scenarioId).map((r) => structuredClone(r));
  }
}
