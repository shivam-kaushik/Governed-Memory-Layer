import type { Db } from "mongodb";
import type { MonitorMetrics } from "../contracts/contracts.js";

// Nearest-rank percentile on a sorted array.
function pct(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

// Tenant-scoped aggregations ($match + $group) over agent_traces within [nowMs - windowMs, nowMs].
export async function computeMetrics(db: Db, tenantId: string, nowMs: number, windowMs: number): Promise<MonitorMetrics> {
  const col = db.collection("agent_traces");
  const match = { $match: { tenantId, createdAtMs: { $gte: nowMs - windowMs } } };

  const byStep = await col.aggregate([
    match,
    { $group: {
      _id: "$step", n: { $sum: 1 },
      denies: { $sum: { $cond: [{ $eq: ["$payload.decision", "deny"] }, 1, 0] } },
      rejected: { $sum: { $size: { $ifNull: ["$payload.rejectedIds", []] } } },
      lat: { $push: "$payload.latencyMs" },
    } },
  ]).toArray();
  const byAction = await col.aggregate([
    match, { $match: { step: "brain_decision" } },
    { $group: { _id: "$payload.action", n: { $sum: 1 } } },
  ]).toArray();

  const recall = byStep.find((s) => s._id === "recall_result");
  const recalls = recall?.n ?? 0;
  const denies = recall?.denies ?? 0;
  const actionsByType: Record<string, number> = {};
  for (const a of byAction) if (a._id != null) actionsByType[a._id] = a.n;
  const decisions = Object.values(actionsByType).reduce((x, y) => x + y, 0);

  const stepLatencyMs: MonitorMetrics["stepLatencyMs"] = {};
  for (const s of byStep) {
    const lat = (s.lat as unknown[]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
    if (lat.length) stepLatencyMs[s._id] = { p50: pct(lat, 0.5), p95: pct(lat, 0.95) };
  }
  return {
    windowMs, recallsPerTenant: recalls, recalls, denies,
    denyRate: recalls ? denies / recalls : 0,
    rejectedPerRecall: recalls ? (recall?.rejected ?? 0) / recalls : 0,
    actionsByType,
    abstainRate: decisions ? (actionsByType["investigate"] ?? 0) / decisions : 0,
    stepLatencyMs,
  };
}
