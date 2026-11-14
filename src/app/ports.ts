import type { Alert, AuditEvent, Clock, EvalStore, Memory, MemoryLayer, Principal, TraceStore } from "../contracts/contracts";
import type { ChatBrain } from "../agent/chat-brain";
import type { PrincipalResolver } from "../core/deps";

// Read-only views the dashboard needs that the frozen seam does not offer.
// Person A implements these on the Mongo stores. Flagged for sign-off; contracts.ts is untouched.
export interface DashboardReads {
  listMemories(p: Principal, scopeIds: string[]): Promise<Memory[]>; // tenant-injected
  listAudit(p: Principal, limit: number): Promise<AuditEvent[]>; // tenant-injected
}

export interface LiveRunResult {
  action: unknown;
  result: unknown;
  traceId: string;
  traceComplete: boolean;
  brain?: string; // which brain decided: "rule-brain" or "llm:<model>"
  fixed?: boolean;
  turns?: unknown[];
}

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

// Live Q&A experiments (Mongo demo only). They run as fixed demo principals; the request carries nothing but an action and an id.
export interface JudgeApi {
  run(action: string, input: { id?: string }, principal: Principal): Promise<unknown>;
}

export interface ApiContext {
  resolver: PrincipalResolver;
  layer: MemoryLayer;
  reads: DashboardReads;
  trace: TraceStore;
  evalStore: EvalStore;
  clock: Clock;
  alerts: Alert[];
  runLive(principal: Principal, sessionToken: string, alert: Alert): Promise<LiveRunResult>;
  proofReport(): Promise<unknown>;
  demoMode: boolean; // clock controls exist only in demo mode
  manual?: { get(): boolean; set(on: boolean): void }; // manual controls switch; off means the agent runs alone
  agentStatus?(): unknown;
  judge?: JudgeApi;
  chat?: ChatBrain; // decides small talk vs memory question vs incident; absent means every message is an incident
}
