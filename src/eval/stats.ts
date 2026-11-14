const Z = 1.959964; // 95%

// Wilson score interval for k successes in n trials. n = 0 is the vacuous [0, 1].
export function wilson(k: number, n: number): [number, number] {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new Error("wilson: need integers with 0 <= k <= n");
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = Z * Z;
  const d = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / d;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// Newcombe hybrid-score interval (method 10) for p1 - p2. Conservative: ignores pairing.
export function newcombeDiff(k1: number, n1: number, k2: number, n2: number): { diff: number; lower: number; upper: number } {
  const [l1, u1] = wilson(k1, n1);
  const [l2, u2] = wilson(k2, n2);
  const p1 = n1 ? k1 / n1 : 0;
  const p2 = n2 ? k2 / n2 : 0;
  const diff = p1 - p2;
  return {
    diff,
    lower: diff - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
    upper: diff + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2),
  };
}
