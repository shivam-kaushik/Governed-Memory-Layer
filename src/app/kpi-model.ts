import type { MonitorMetrics } from "../contracts/contracts";

export type Tone = "teal" | "violet" | "amber" | "rose" | "blue";

// One glass column in the 3D scene. Every number also renders as text beside the scene.
export interface Kpi {
  id: string;
  label: string;
  value: string; // headline, always shown as text too
  detail: string; // sample count: "1 / 3 recalls", never a bare rate
  level: number; // 0..1 column height
  points: number[]; // 0..1 recent samples, drawn as floating data points
  tone: Tone;
}

const HISTORY = 24;
const clamp = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const worstP95 = (m: MonitorMetrics) => Math.max(0, ...Object.values(m.stepLatencyMs).map((s) => s.p95));

// One sample per poll, oldest first, capped. Column order is fixed: recalls, deny rate, abstain rate, rejected/recall, actions, worst p95.
const raw = (m: MonitorMetrics) => [m.recalls, m.denyRate, m.abstainRate, m.rejectedPerRecall, sum(m.actionsByType), worstP95(m)];

export function pushHistory(h: number[][], m: MonitorMetrics): number[][] {
  return [...h, raw(m)].slice(-HISTORY);
}

// Counts are scaled against the largest value seen in the window so the shape shows movement, not magnitude.
const series = (h: number[][], i: number, cap?: number) => {
  const col = h.map((r) => r[i] ?? 0);
  const top = cap ?? Math.max(1, ...col);
  return col.map((v) => clamp(v / top));
};

export function kpisFromMetrics(m: MonitorMetrics | null, h: number[][]): Kpi[] {
  if (!m) return [];
  const [rec, , , rej, act, lat] = raw(m) as [number, number, number, number, number, number];
  const recTop = Math.max(1, ...h.map((r) => r[0] ?? 0), rec);
  const actTop = Math.max(1, ...h.map((r) => r[4] ?? 0), act);
  return [
    { id: "recalls", label: "Recalls", value: String(rec), detail: `${rec} recalls in window`, level: clamp(rec / recTop), points: series(h, 0), tone: "teal" },
    { id: "denies", label: "Deny rate", value: pct(m.denyRate), detail: `${m.denies} / ${m.recalls} recalls`, level: clamp(m.denyRate), points: series(h, 1, 1), tone: "rose" },
    { id: "abstain", label: "Abstain rate", value: pct(m.abstainRate), detail: "agent investigated instead of acting on memory", level: clamp(m.abstainRate), points: series(h, 2, 1), tone: "amber" },
    { id: "rejected", label: "Rejected / recall", value: rej.toFixed(1), detail: "candidates dropped per recall", level: clamp(rej / 5), points: series(h, 3, 5), tone: "violet" },
    { id: "actions", label: "Actions", value: String(act), detail: Object.entries(m.actionsByType).map(([k, v]) => `${k}: ${v}`).join(", ") || "none yet", level: clamp(act / actTop), points: series(h, 4), tone: "blue" },
    { id: "latency", label: "Worst p95", value: `${Math.round(lat)} ms`, detail: "slowest step, 95th percentile", level: clamp(lat / 500), points: series(h, 5, 500), tone: "teal" },
  ];
}

interface Arm { success: number; n: number; rate: number; ci: [number, number] }

// Proof arms as columns; the confidence interval is shown as two data points above and below the rate.
export function kpisFromProof(arms: Record<"R" | "O" | "P" | "C", Arm>): Kpi[] {
  const names = { R: "Real memory", O: "No memory", P: "Placebo", C: "Counterfactual" } as const;
  const tones = { R: "teal", O: "rose", P: "amber", C: "violet" } as const;
  return (["R", "O", "P", "C"] as const).map((a) => ({
    id: `arm-${a}`,
    label: names[a],
    value: pct(arms[a].rate),
    detail: `${arms[a].success} / ${arms[a].n} successes`,
    level: clamp(arms[a].rate),
    points: [clamp(arms[a].ci[0]), clamp(arms[a].ci[1])],
    tone: tones[a],
  }));
}
