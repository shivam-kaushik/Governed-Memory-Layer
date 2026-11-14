import type { Embedder, MemoryRepo } from "../contracts/contracts";
import { hashClaim } from "../core/claim";
import type { Scenario } from "./scenarios";

// Inserts a scenario's memories straight into a repo (test/demo setup, bypasses policy by design).
export async function seedScenario(s: Scenario, repo: MemoryRepo, embedder: Embedder, embeddingModel: string): Promise<void> {
  for (const m of s.memoriesToSeed) {
    const owner = Object.values(s.principals).find((p) => p.tenantId === m.tenantId);
    if (!owner) throw new Error(`no principal for tenant ${m.tenantId}`);
    await repo.insert(owner, {
      ...m,
      embedding: await embedder.embed(m.text),
      embeddingModel,
      contentHash: hashClaim(m.text, m.value),
    });
  }
}
