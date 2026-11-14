import { z } from "zod";
import type { MemoryType, Principal, ReasonCode } from "../contracts/contracts";
import { sha256 } from "./audit";
import type { CoreDeps } from "./deps";
import { scanInjection } from "./inject-scan";

const DAY = 86_400_000;
export const MAX_TTL_MS: Record<MemoryType, number> = {
  fix: 30 * DAY,
  playbook: 90 * DAY,
  preference: 365 * DAY,
  fact: 90 * DAY, // not in plan.md: fail-closed choice, flagged to the user
};

export const SOURCE_AUTHORITY = 0.5; // shortcut: constant until plan.md defines authority

const nonEmpty = z.string().min(1);
// ttlMs is checked separately so it reports TTL_INVALID, not INVALID_INPUT. Unknown keys are stripped (G1).
export const inputSchema = z.object({
  memoryType: z.enum(["fix", "preference", "fact", "playbook"]),
  claimKey: nonEmpty,
  text: z.string().min(1).max(2000),
  value: z.record(z.string(), z.unknown()),
  appliesTo: z.object({ service: nonEmpty, versionRange: nonEmpty, environment: nonEmpty }),
  scope: z.enum(["team", "private"]),
  ttlMs: z.unknown().optional(),
  confidence: z.number().min(0).max(1),
  source: z.object({ type: nonEmpty, ref: nonEmpty }),
  derivedFrom: z.array(nonEmpty).optional(),
});

export const ttlValid = (type: MemoryType, ttl: unknown): ttl is number =>
  typeof ttl === "number" && Number.isInteger(ttl) && ttl > 0 && ttl <= MAX_TTL_MS[type];

export const hashClaim = (text: string, value: Record<string, unknown>) => sha256(`${text}\n${JSON.stringify(value)}`);

function hasSuspiciousString(v: unknown): boolean {
  if (typeof v === "string") return scanInjection(v).suspicious;
  if (Array.isArray(v)) return v.some(hasSuspiciousString);
  if (v && typeof v === "object") return Object.values(v).some(hasSuspiciousString);
  return false;
}
export const isSuspicious = (text: string, value: Record<string, unknown>) => hasSuspiciousString(text) || hasSuspiciousString(value);

// G8: a derived memory is never broader than its narrowest source, and sources must be visible to the caller.
export async function sourcesError(
  deps: CoreDeps,
  p: Principal,
  scopeId: string,
  derivedFrom: string[],
): Promise<ReasonCode | null> {
  const want = [...new Set(derivedFrom)];
  const sources = await deps.repo.byIds(p, want);
  if (sources.length !== want.length || sources.some((s) => !p.scopes.includes(s.scopeId))) return "INVALID_INPUT";
  if (scopeId.startsWith("team:") && sources.some((s) => s.scopeId.startsWith("private:"))) return "SCOPE_DENIED";
  return null;
}
