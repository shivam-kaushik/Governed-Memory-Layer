import type { Principal } from "../../src/contracts/contracts";
import type { CoreDeps } from "../../src/core/deps";
import { remember } from "../../src/core/remember";
import { FakeAuditStore } from "../../src/fakes/fake-audit-store";
import { FakeClock } from "../../src/fakes/fake-clock";
import { FakeEmbedder } from "../../src/fakes/fake-embedder";
import { FakeMemoryRepo } from "../../src/fakes/fake-repo";

export const NOW = 1_700_000_000_000;
export const DAY = 86_400_000;
export const PURPOSE = "incident-triage";

const mk = (id: string, tenantId: string, role: Principal["role"]): Principal => ({
  id,
  tenantId,
  role,
  scopes: [`team:${tenantId}`, `private:${id}`],
  purposes: [PURPOSE],
});
export const resp = mk("a-resp", "tenant-a", "responder");
export const resp2 = mk("a-resp2", "tenant-a", "responder");
export const rev = mk("a-rev", "tenant-a", "reviewer");
export const respB = mk("b-resp", "tenant-b", "responder");
const tokens: Record<string, Principal> = {
  "tok-resp": resp,
  "tok-resp2": resp2,
  "tok-rev": rev,
  "tok-respB": respB,
};

export const caller = (sessionToken = "tok-resp", purpose = PURPOSE) => ({ sessionToken, purpose });

export const fixInput = (o: Record<string, unknown> = {}) => ({
  memoryType: "fix",
  claimKey: "checkout-service/5xx/cache",
  text: "checkout-service 5xx spike after deploy: restart cache pool cp-1a2b3c",
  value: { action: "restart_cache_pool", pool: "cp-1a2b3c" },
  appliesTo: { service: "checkout-service", versionRange: ">=2.0.0 <3.0.0", environment: "prod" },
  scope: "private",
  ttlMs: 7 * DAY,
  confidence: 0.9,
  source: { type: "incident", ref: "inc-1" },
  ...o,
});

export const query = (o: Record<string, unknown> = {}) => ({
  text: "checkout-service 5xx errors after deploy",
  service: "checkout-service",
  version: "2.3.1",
  environment: "prod",
  ...o,
});

export function setup(repo: FakeMemoryRepo = new FakeMemoryRepo()) {
  let n = 0;
  const audit = new FakeAuditStore();
  const clock = new FakeClock(NOW);
  const deps: CoreDeps = {
    resolvePrincipal: async (t) => tokens[t] ?? null,
    repo,
    embedder: new FakeEmbedder(),
    clock,
    audit,
    newId: (prefix) => `${prefix}_${++n}`,
    embeddingModel: "fake-hash",
    policyVersion: "v1",
  };
  const seed = (o: Record<string, unknown> = {}, token = "tok-resp") => remember(deps, fixInput(o), caller(token));
  return { deps, repo, audit, clock, seed };
}
