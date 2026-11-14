// Frozen seam between Person A (src/db) and Person B (src/core, agent, eval, app).
// DRAFT: needs Person A's sign-off. After sign-off, change only by joint edit.
// Derived from plan.md sections 4, 9 and 13.

// ---------- Identity ----------
export type Role = "responder" | "reviewer" | "admin";

export interface Principal {
  id: string;
  tenantId: string;
  role: Role;
  scopes: string[]; // "team:<tenantId>" | "private:<principalId>"
  purposes: string[];
}

export interface Caller {
  sessionToken: string;
  purpose: string;
}

export interface Clock {
  nowMs(): number;
  advanceMs?(ms: number): void;
}

// ---------- Memory ----------
export type MemoryType = "fix" | "preference" | "fact" | "playbook";
export type MemoryStatus =
  | "active"
  | "quarantined"
  | "disputed"
  | "superseded"
  | "expired"
  | "deleted";

export interface AppliesTo {
  service: string;
  versionRange: string;
  environment: string;
}

export interface Memory {
  _id: string;
  tenantId: string; // from Principal, never from input
  scopeId: string;
  purposeTags: string[];
  memoryType: MemoryType;
  claimKey: string;
  text: string;
  value: Record<string, unknown>;
  appliesTo: AppliesTo;
  embedding: number[]; // 384-d, L2-normalized
  embeddingModel: string;
  contentHash: string;
  version: number;
  supersedes?: string;
  derivedFrom: string[];
  validFromMs: number;
  expiresAtMs: number; // hard gate: eligible only if now < expiresAtMs
  status: MemoryStatus;
  confidence: number; // 0..1
  sourceAuthority: number; // 0..1
  source: { type: string; ref: string };
  createdBy: string;
  createdAtMs: number;
  policyVersion: string;
}

// ---------- Memory layer API ----------
export interface RememberInput {
  memoryType: MemoryType;
  claimKey: string;
  text: string;
  value: Record<string, unknown>;
  appliesTo: AppliesTo;
  scope: "team" | "private";
  ttlMs: number;
  confidence: number;
  source: { type: string; ref: string };
  derivedFrom?: string[];
}

export interface RecallQuery {
  text: string;
  service: string;
  version: string;
  environment: string;
  limit?: number;
}

export interface EvidenceCard {
  memoryId: string;
  version: number;
  statement: string;
  value: Record<string, unknown>;
  expiresAtMs: number;
  confidence: number;
  sourceAuthority: number;
  score: number;
}

export type Decision = "allow" | "deny" | "partial";

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

export interface RecallResult {
  cards: EvidenceCard[];
  traceId: string;
  decision: Decision;
}

export interface MemoryLayer {
  remember(input: RememberInput, caller: Caller): Promise<{ id: string; status: string; traceId: string }>;
  recall(query: RecallQuery, caller: Caller): Promise<RecallResult>;
  correct(
    id: string,
    patch: Partial<RememberInput> & { reason: string },
    caller: Caller,
  ): Promise<{ newId: string; supersedes: string; traceId: string }>;
  forget(
    id: string,
    reason: string,
    caller: Caller,
  ): Promise<{ tombstoneId: string; cascadedIds: string[]; traceId: string }>;
  promote(id: string, caller: Caller): Promise<{ newId: string; traceId: string }>;
}

// ---------- Audit / trace / eval ----------
export type MemoryOp = "remember" | "recall" | "correct" | "forget" | "promote";

// Ids, hashes, decisions and reason codes only. Never raw memory text.
export interface AuditEvent {
  _id: string;
  traceId: string;
  tenantId: string;
  actorId: string;
  purpose: string;
  op: MemoryOp;
  decision: Decision;
  reasonCodes: ReasonCode[];
  selectedIds: string[];
  rejectedIds: { id: string; reason: ReasonCode }[];
  queryHash: string;
  createdAtMs: number;
}

export type TraceStep =
  | "alert_received"
  | "recall_requested"
  | "recall_result"
  | "brain_input"
  | "brain_decision"
  | "tool_validation"
  | "tool_executed"
  | "memory_written"
  | "trace_closed";

// payload: ids, hashes, reason codes, short redacted summaries only.
export interface TraceEvent {
  _id: string;
  traceId: string;
  tenantId: string;
  principalId: string;
  step: TraceStep;
  payload: Record<string, unknown>;
  createdAtMs: number;
  complete?: boolean; // set on trace_closed
}

export interface MonitorMetrics {
  windowMs: number;
  recalls: number;
  denies: number;
  denyRate: number;
  rejectedPerRecall: number;
  actionsByType: Record<string, number>;
  abstainRate: number;
  stepLatencyMs: Partial<Record<TraceStep, { p50: number; p95: number }>>;
}

export interface MonitorAlert {
  kind:
    | "canary_in_trace"
    | "expired_memory_adopted"
    | "wrong_version_adopted"
    | "deleted_memory_adopted"
    | "deny_rate_spike"
    | "tool_guard_rejected";
  traceId: string;
  tenantId: string;
  createdAtMs: number;
  detail: string; // ids/reason codes only
}

export type ProofArm = "R" | "O" | "P" | "C";

export interface EvalRun {
  _id: string;
  scenarioId: string;
  arm: ProofArm;
  seed: number;
  action: Action;
  scores: Record<string, number | boolean>;
  createdAtMs: number;
}

// ---------- Stores (Person A implements, Person B fakes) ----------
export interface MemoryRepo {
  insert(p: Principal, doc: Memory): Promise<void>;
  getById(p: Principal, id: string): Promise<Memory | null>;
  byIds(p: Principal, ids: string[]): Promise<Memory[]>; // tenant-injected
  findActiveByClaimKey(p: Principal, scopeIds: string[], claimKey: string): Promise<Memory[]>;
  vectorSearch(
    p: Principal,
    q: { vector: number[]; scopeIds: string[]; nowMs: number; limit: number },
  ): Promise<Array<{ id: string; score: number }>>;
  setStatus(p: Principal, id: string, status: MemoryStatus): Promise<void>;
  supersede(p: Principal, oldId: string, newDoc: Memory): Promise<void>; // one transaction
  findDerived(p: Principal, id: string): Promise<string[]>; // direct children via derivedFrom
  tombstoneAndPurge(p: Principal, ids: string[], reason: string): Promise<{ tombstoneIds: string[] }>; // one transaction
  isTombstoned(p: Principal, id: string, contentHash?: string): Promise<boolean>;
  expireDue(nowMs: number): Promise<string[]>;
  replayTombstones(): Promise<number>;
}

export interface AuditStore {
  record(e: AuditEvent): Promise<void>;
}

export interface TraceStore {
  emit(e: TraceEvent): Promise<void>; // append-only: no update/delete methods
  listByTrace(p: Principal, traceId: string): Promise<TraceEvent[]>;
  feed(p: Principal, sinceMs: number): AsyncIterable<TraceEvent>;
  metrics(p: Principal, windowMs: number): Promise<MonitorMetrics>;
  alerts(p: Principal, sinceMs: number): Promise<MonitorAlert[]>;
}

export interface EvalStore {
  saveRun(r: EvalRun): Promise<void>;
  listRuns(scenarioId: string): Promise<EvalRun[]>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>; // 384-d, L2-normalized
}

// ---------- Agent side ----------
export interface Alert {
  id: string;
  service: string;
  version: string;
  environment: string;
  symptom: string;
  text: string;
}

export type ToolName = "investigate" | "restart_cache_pool" | "rollback_deploy" | "scale_service";

export interface Action {
  tool: ToolName;
  args: Record<string, string | number>;
  usedMemoryIds: string[];
}

export interface Brain {
  decide(alert: Alert, cards: EvidenceCard[]): Promise<Action>;
}
