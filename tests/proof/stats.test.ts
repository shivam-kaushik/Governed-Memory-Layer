import { describe, expect, it } from "vitest";
import { newcombeDiff, wilson } from "../../src/eval/stats";

describe("wilson 95% interval (known values)", () => {
  it("0 / 20 -> [0, 0.1611]", () => {
    const [lo, hi] = wilson(0, 20);
    expect(lo).toBeCloseTo(0, 6);
    expect(hi).toBeCloseTo(0.1611, 3);
  });

  it("20 / 20 -> [0.8388, 1]", () => {
    const [lo, hi] = wilson(20, 20);
    expect(lo).toBeCloseTo(0.8388, 3);
    expect(hi).toBeCloseTo(1, 6);
  });

  it("10 / 20 -> [0.2993, 0.7007]", () => {
    const [lo, hi] = wilson(10, 20);
    expect(lo).toBeCloseTo(0.2993, 3);
    expect(hi).toBeCloseTo(0.7007, 3);
  });

  it("0 / 300 -> upper 0.0126 (the 'zero leaks in 300 tests' bound)", () => {
    expect(wilson(0, 300)[1]).toBeCloseTo(0.0126, 3);
  });

  it("n = 0 is the vacuous interval, never NaN", () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it("brackets the point estimate and stays in [0, 1]", () => {
    for (const [k, n] of [[1, 20], [7, 30], [19, 20], [150, 300]] as const) {
      const [lo, hi] = wilson(k, n);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(lo).toBeLessThanOrEqual(k / n);
      expect(hi).toBeGreaterThanOrEqual(k / n);
    }
  });

  it("rejects impossible counts", () => {
    expect(() => wilson(21, 20)).toThrow();
    expect(() => wilson(-1, 20)).toThrow();
    expect(() => wilson(1.5, 20)).toThrow();
  });
});

describe("newcombeDiff (difference of two proportions, 95%)", () => {
  it("20/20 vs 0/20 -> diff 1, lower 0.7721", () => {
    const d = newcombeDiff(20, 20, 0, 20);
    expect(d.diff).toBeCloseTo(1, 6);
    expect(d.lower).toBeCloseTo(0.7721, 3);
    expect(d.upper).toBeCloseTo(1, 6);
  });

  it("equal rates -> interval straddles zero", () => {
    const d = newcombeDiff(10, 20, 10, 20);
    expect(d.diff).toBe(0);
    expect(d.lower).toBeLessThan(0);
    expect(d.upper).toBeGreaterThan(0);
  });
});
