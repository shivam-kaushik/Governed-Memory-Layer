// Frozen seam between Person A (src/db) and Person B (src/core, agent, eval, app).
// Change only by joint edit.

// ---------- Data model (plan section 4) ----------
export type MemoryType = "fix" | "preference" | "fact" | "playbook";
export type MemoryStatus = "active" | "quarantined" | "disputed" | "superseded" | "expired" | "deleted";

export interface Memory {
  _id: string;
  tenantId: string;
  scopeId: string; // "team:<tenant>" | "private:<principalId>"
  purposeTags: string[];
  memoryType: MemoryType;
  claimKey: string;
  text: string;
  value: Record<string, unknown>;
  appliesTo: { service: string; versionRange: string; environment: string };
  embedding: number[]; // 384 dims
  embeddingModel: string;
  contentHash: string;
  version: number;
  supersedes?: string;
  derivedFrom: string[];
  validFromMs: number;
  expiresAtMs: number; // hard gate
  purgeAt?: Date; // cleanup-only TTL field, set by the repo
  status: MemoryStatus;
  confidence: number;
  sourceAuthority: number;
  source: { type: string; ref: string };
  createdBy: string;
  createdAtMs: number;
  policyVersion: string;
}

export interface Principal {
  id: string;
  tenantId: string;
  role: "responder" | "reviewer" | "admin";
  scopes: string[];
  purposes: string[];
}

export type Decision = "allow" | "deny" | "partial";

// Audit rows hold ids, hashes, decisions and reason codes only: never raw memory text.
export interface AuditEvent {
  _id?: string;
  traceId: string;
  tenantId: string;
  actorId: string;
  purpose: string;
  op: "remember" | "recall" | "correct" | "forget" | "promote";
  decision: Decision;
  reasonCodes: string[];
  selectedIds: string[];
  rejectedIds: { id: string; reason: string }[];
  queryHash: string;
  createdAtMs: number;
}

export type TraceStep =
  | "alert_received" | "recall_requested" | "recall_result" | "brain_input"
  | "brain_decision" | "tool_validation" | "tool_executed" | "memory_written" | "trace_closed";

export interface TraceEvent {
  _id?: string;
  traceId: string;
  tenantId: string;
  principalId: string;
  step: TraceStep;
  payload: Record<string, unknown>; // ids/hashes/reason codes only
  createdAtMs: number;
  seq?: number; // per-trace ordering
  complete?: boolean;
}

export interface MonitorMetrics {
  windowMs: number;
  recallsPerTenant: number;
  recalls: number;
  denies: number;
  denyRate: number;
  rejectedPerRecall: number;
  actionsByType: Record<string, number>;
  abstainRate: number;
  stepLatencyMs: Record<string, { p50: number; p95: number }>;
}

export interface MonitorAlert {
  kind: "canary_in_trace" | "stale_memory_adopted" | "deny_rate_spike" | "tool_guard_rejected";
  traceId: string;
  tenantId: string;
  detail: string; // ids/reason codes only
  createdAtMs: number;
}

export interface EvalRun {
  _id?: string;
  scenarioId: string;
  arm: "R" | "O" | "P" | "C";
  seed: number;
  action: Record<string, unknown>;
  scores: Record<string, number | boolean>;
  createdAtMs: number;
}

// ---------- Public memory API (plan section 9) ----------
export interface Caller { sessionToken: string; purpose: string }

export interface RememberInput {
  memoryType: MemoryType;
  claimKey: string; text: string; value: Record<string, unknown>;
  appliesTo: { service: string; versionRange: string; environment: string };
  scope: "team" | "private";
  ttlMs: number; confidence: number;
  source: { type: string; ref: string };
  derivedFrom?: string[];
}
export interface EvidenceCard {
  memoryId: string; version: number; statement: string;
  value: Record<string, unknown>; expiresAtMs: number;
  confidence: number; sourceAuthority: number; score: number;
}
export interface RecallResult { cards: EvidenceCard[]; traceId: string; decision: Decision }

export interface MemoryLayer {
  remember(input: RememberInput, caller: Caller): Promise<{ id: string; status: string; traceId: string }>;
  recall(query: { text: string; service: string; version: string; environment: string; limit?: number }, caller: Caller): Promise<RecallResult>;
  correct(id: string, patch: Partial<RememberInput> & { reason: string }, caller: Caller): Promise<{ newId: string; supersedes: string; traceId: string }>;
  forget(id: string, reason: string, caller: Caller): Promise<{ tombstoneId: string; cascadedIds: string[]; traceId: string }>;
  promote(id: string, caller: Caller): Promise<{ newId: string; traceId: string }>;
}

// ---------- Seam contract (plan section 13) ----------
export interface MemoryRepo {
  insert(p: Principal, doc: Memory): Promise<void>;
  getById(p: Principal, id: string): Promise<Memory | null>;
  byIds(p: Principal, ids: string[]): Promise<Memory[]>;
  findActiveByClaimKey(p: Principal, scopeIds: string[], claimKey: string): Promise<Memory[]>;
  vectorSearch(p: Principal, q: { vector: number[]; scopeIds: string[]; nowMs: number; limit: number }): Promise<Array<{ id: string; score: number }>>;
  setStatus(p: Principal, id: string, status: Memory["status"]): Promise<void>;
  supersede(p: Principal, oldId: string, newDoc: Memory): Promise<void>; // one transaction
  findDerived(p: Principal, id: string): Promise<string[]>;
  tombstoneAndPurge(p: Principal, ids: string[], reason: string): Promise<{ tombstoneIds: string[] }>; // one transaction
  isTombstoned(p: Principal, id: string, contentHash?: string): Promise<boolean>;
  expireDue(nowMs: number): Promise<string[]>;
  replayTombstones(): Promise<number>;
}
export interface AuditStore { record(e: AuditEvent): Promise<void> }
export interface TraceStore {
  emit(e: TraceEvent): Promise<void>; // append-only
  listByTrace(p: Principal, traceId: string): Promise<TraceEvent[]>;
  // idleMs: end after the backlog drains and nothing new arrives for that long (snapshot read). limit: cap the backlog read. Omitted: live feed.
  feed(p: Principal, sinceMs: number, o?: { idleMs?: number; limit?: number }): AsyncIterable<TraceEvent>;
  metrics(p: Principal, windowMs: number): Promise<MonitorMetrics>;
  alerts(p: Principal, sinceMs: number): Promise<MonitorAlert[]>;
}
export interface EvalStore { saveRun(r: EvalRun): Promise<void>; listRuns(scenarioId: string): Promise<EvalRun[]> }
export interface Embedder { embed(text: string): Promise<number[]> } // 384-d, L2-normalized
export interface Clock { nowMs(): number; advanceMs?(ms: number): void }

// ---------- Agent side ----------
export interface Action {
  tool: "investigate" | "restart_cache_pool" | "rollback_deploy" | "scale_service";
  args: Record<string, string | number>;
  usedMemoryIds: string[];
}
export interface Alert { id: string; service: string; version: string; environment: string; symptom: string; text: string }
export interface Brain { decide(alert: Alert, cards: EvidenceCard[]): Promise<Action> }

// Constants shared by both sides.
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

// ---------- Person B additive types (joint edit; A types unchanged) ----------
export type ReasonCode =
  | "EXPIRED"
  | "WRONG_VERSION"
  | "WRONG_SERVICE"
  | "WRONG_ENVIRONMENT"
  | "OTHER_SCOPE"
  | "QUARANTINED"
  | "TOMBSTONED"
  | "STALE_INDEX"
  | "NO_ELIGIBLE"
  | "UNKNOWN_PRINCIPAL"
  | "PURPOSE_DENIED"
  | "SCOPE_DENIED"
  | "OP_DENIED"
  | "INVALID_INPUT"
  | "TTL_INVALID"
  | "INJECTION_SUSPECTED"
  | "DUPLICATE"
  | "CONFLICT";
export type MemoryOp = AuditEvent["op"];
export type ProofArm = EvalRun["arm"];
export type ToolName = Action["tool"];
export interface RecallQuery { text: string; service: string; version: string; environment: string; limit?: number }
