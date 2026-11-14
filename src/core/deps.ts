import type { Reranker } from "./voyage";
import type { AuditStore, Clock, Embedder, MemoryRepo } from "../contracts/contracts";

// Maps a session token to a raw principal record, or null. Output is untrusted until validated by identity.ts.
export type PrincipalResolver = (token: string) => Promise<unknown>;

export interface CoreDeps {
  resolvePrincipal: PrincipalResolver;
  repo: MemoryRepo;
  embedder: Embedder;
  clock: Clock;
  audit: AuditStore;
  newId: (prefix: string) => string;
  embeddingModel: string;
  policyVersion: string;
  reranker?: Reranker; // optional ranking signal; failure falls back to local similarity
}
