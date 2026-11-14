const DAY = 86_400_000;

// Ranking only. Recency never decides eligibility (expiry is a separate hard gate).
export function recencyScore(ageMs: number): number {
  return 1 / (1 + Math.max(0, ageMs) / DAY);
}

export function rerankScore(x: { sim: number; confidence: number; authority: number; recency: number }): number {
  return 0.6 * x.sim + 0.2 * x.confidence + 0.1 * x.authority + 0.1 * x.recency;
}
