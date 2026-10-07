import { describe, expect, it } from 'vitest';
import { BREAK_EVEN_MAX_RUNS, breakEvenRuns } from './breakEvenRuns';

// Fixed cost 1000 up front (a BPO), +10 profit per run.
const withFixedCost = (runs: number) => 10 * runs - 1000;

describe('breakEvenRuns', () => {
  it('finds the smallest run count whose profit is not negative', () => {
    expect(breakEvenRuns(withFixedCost, 1)).toBe(100);
  });

  it('returns the current runs when already at or above break even', () => {
    expect(breakEvenRuns(withFixedCost, 150)).toBe(150);
  });

  it('never returns fewer runs than the current plan', () => {
    expect(breakEvenRuns(() => 5, 7)).toBe(7);
  });

  it('finds an exact-zero point', () => {
    expect(breakEvenRuns((r) => r - 37, 1)).toBe(37);
  });

  it('returns null when profit is unknown', () => {
    expect(breakEvenRuns(() => null, 1)).toBeNull();
  });

  it('returns null when more runs only lose more', () => {
    expect(breakEvenRuns((r) => -r, 1)).toBeNull();
  });

  it('returns null past the run cap', () => {
    expect(breakEvenRuns((r) => r - (BREAK_EVEN_MAX_RUNS + 5), 1)).toBeNull();
  });

  it('copes with a stepped profit curve', () => {
    // Profit only turns positive once 12+ runs fit one cheaper tier.
    expect(breakEvenRuns((r) => (r >= 12 ? 1 : -1), 1)).toBe(12);
  });
});
