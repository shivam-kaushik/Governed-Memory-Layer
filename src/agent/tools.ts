import { z } from "zod";
import type { Action, ToolName } from "../contracts/contracts";

// Tools come from this allowlist only. Memory text can never add one (G16, G17).
export const TOOL_ALLOWLIST: readonly ToolName[] = ["investigate", "restart_cache_pool", "rollback_deploy", "scale_service"];

export const POOL_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type GuardReason = "ACTION_MALFORMED" | "TOOL_NOT_ALLOWED" | "ARGS_INVALID" | "USED_IDS_INVALID" | "MEMORY_INVALID";

export interface ToolResult {
  executed: boolean;
  fixed: boolean;
  rejected?: GuardReason;
  findings?: string; // tool output the agent may read next turn; untrusted data, never traced
}

export interface ToolSimulator {
  run(action: Action): ToolResult;
}

const argSchemas: Record<ToolName, z.ZodType> = {
  investigate: z.object({}).strict(),
  restart_cache_pool: z.object({ pool: z.string().regex(POOL_RE) }).strict(),
  rollback_deploy: z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict(),
  scale_service: z.object({ replicas: z.number().int().min(1).max(50) }).strict(),
};

const actionShape = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.union([z.string(), z.number()])),
  usedMemoryIds: z.array(z.string()),
});

export type Validation = { ok: true; action: Action } | { ok: false; reason: GuardReason; action?: Action };

// Validates a brain's raw output, independent of any memory content.
export function validateAction(raw: unknown, evidenceIds: string[]): Validation {
  const shaped = actionShape.safeParse(raw);
  if (!shaped.success) return { ok: false, reason: "ACTION_MALFORMED" };
  const action = shaped.data as Action;
  if (!(TOOL_ALLOWLIST as readonly string[]).includes(action.tool)) return { ok: false, reason: "TOOL_NOT_ALLOWED", action };
  if (!argSchemas[action.tool].safeParse(action.args).success) return { ok: false, reason: "ARGS_INVALID", action };
  if (!action.usedMemoryIds.every((id) => evidenceIds.includes(id))) return { ok: false, reason: "USED_IDS_INVALID", action };
  return { ok: true, action };
}

// Deterministic state machine: a cache-pool restart fixes the incident only for the true pool.
// Optional extras make other incidents fixable the same way: a rollback to the true version, or enough replicas.
export function makeSimulator(truePool: string, extra: { rollbackVersion?: string; minReplicas?: number } = {}): ToolSimulator {
  return {
    run(action) {
      switch (action.tool) {
        case "restart_cache_pool":
          return { executed: true, fixed: action.args.pool === truePool };
        case "rollback_deploy":
          return { executed: true, fixed: extra.rollbackVersion !== undefined && action.args.version === extra.rollbackVersion };
        case "scale_service":
          return { executed: true, fixed: extra.minReplicas !== undefined && typeof action.args.replicas === "number" && action.args.replicas >= extra.minReplicas };
        case "investigate":
          return { executed: true, fixed: false };
        default:
          return { executed: false, fixed: false, rejected: "TOOL_NOT_ALLOWED" };
      }
    },
  };
}

// Demo variant: investigating surfaces the failing pool (like reading logs). Other tools are unchanged.
export function withFindings(base: ToolSimulator, truePool: string, findings?: string): ToolSimulator {
  return {
    run(action) {
      const r = base.run(action);
      return action.tool === "investigate" && r.executed
        ? { ...r, findings: findings ?? `Logs: cache pool ${truePool} is saturated, connection timeouts behind the 5xx spike.` }
        : r;
    },
  };
}
