import { describe, expect, it } from 'vitest';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import { compareDelta, isAbsentValue } from './compareFormat';

const row = (key: CompareRow['key'], values: number[]): CompareRow => ({
  key,
  values,
  differs: true,
  bestIndices: [],
  direction: 'higher',
});

describe('isAbsentValue', () => {
  it('treats a missing column, NaN and a role stat at zero as absent', () => {
    expect(isAbsentValue(row('ehp', [100]), null)).toBe(true);
    expect(isAbsentValue(row('priceSell', [NaN]), 0)).toBe(true);
    expect(isAbsentValue(row('tacklePoints', [0]), 0)).toBe(true);
    expect(isAbsentValue(row('ehp', [0]), 0)).toBe(false);
  });
});

describe('compareDelta', () => {
  it('compares later columns to the Baseline, never the Baseline itself', () => {
    expect(compareDelta(row('ehp', [100, 150]), 0)).toBeNull();
    expect(compareDelta(row('ehp', [100, 150]), 1)).toEqual({ percent: 50, tone: 'better' });
  });

  it('gives no delta for capacitor, a missing column, or an absent Baseline', () => {
    expect(compareDelta(row('capacitor', [40, 60]), 1)).toBeNull();
    expect(compareDelta(row('ehp', [100, 150]), null)).toBeNull();
    expect(compareDelta(row('tacklePoints', [0, 2]), 1)).toBeNull();
  });
});
