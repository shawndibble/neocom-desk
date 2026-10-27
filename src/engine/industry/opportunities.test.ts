import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ORDER_DEPTH_THRESHOLDS,
  classifyOrderDepth,
  rankOpportunities,
  type OpportunityCandidateResult,
} from './opportunities';

describe('classifyOrderDepth', () => {
  it('is unknown when the sell depth could not be priced', () => {
    expect(classifyOrderDepth(null, 1_000_000)).toBe('unknown');
  });

  it('is unknown when the build cost is zero or negative', () => {
    expect(classifyOrderDepth(1_000_000, 0)).toBe('unknown');
    expect(classifyOrderDepth(1_000_000, -1)).toBe('unknown');
  });

  it('is deep at or above the deep ratio', () => {
    expect(classifyOrderDepth(3_000_000, 1_000_000)).toBe('deep');
    expect(classifyOrderDepth(4_000_000, 1_000_000)).toBe('deep');
  });

  it('is thin strictly below the thin ratio', () => {
    expect(classifyOrderDepth(499_999, 1_000_000)).toBe('thin');
    expect(classifyOrderDepth(0, 1_000_000)).toBe('thin');
  });

  it('is moderate between the two ratios, inclusive of the thin boundary', () => {
    expect(classifyOrderDepth(500_000, 1_000_000)).toBe('moderate');
    expect(classifyOrderDepth(2_999_999, 1_000_000)).toBe('moderate');
  });

  it('respects custom thresholds', () => {
    const thresholds = { deepAtOrAboveRatio: 2, thinBelowRatio: 1 };
    expect(classifyOrderDepth(2_000_000, 1_000_000, thresholds)).toBe('deep');
    expect(classifyOrderDepth(999_999, 1_000_000, thresholds)).toBe('thin');
    expect(classifyOrderDepth(1_500_000, 1_000_000, thresholds)).toBe('moderate');
  });

  it('DEFAULT_ORDER_DEPTH_THRESHOLDS is 3 / 0.5', () => {
    expect(DEFAULT_ORDER_DEPTH_THRESHOLDS).toEqual({ deepAtOrAboveRatio: 3, thinBelowRatio: 0.5 });
  });
});

describe('rankOpportunities', () => {
  function candidate(
    overrides: Partial<OpportunityCandidateResult> = {}
  ): OpportunityCandidateResult {
    return {
      id: 'a',
      iskPerHour: 1_000_000,
      buildCost: 1_000_000,
      sellDepthIsk: 3_000_000,
      ...overrides,
    };
  }

  it('sorts by ISK/hour descending', () => {
    const rows = rankOpportunities([
      candidate({ id: 'low', iskPerHour: 1 }),
      candidate({ id: 'high', iskPerHour: 3 }),
      candidate({ id: 'mid', iskPerHour: 2 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('sorts a null ISK/hour (unpriceable) after every priced row', () => {
    const rows = rankOpportunities([
      candidate({ id: 'unpriceable', iskPerHour: null }),
      candidate({ id: 'priced', iskPerHour: 1 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['priced', 'unpriceable']);
  });

  it('attaches each row its own order-depth classification', () => {
    const rows = rankOpportunities([
      candidate({ id: 'deep', sellDepthIsk: 5_000_000 }),
      candidate({ id: 'thin', sellDepthIsk: 0 }),
    ]);
    expect(rows.find((r) => r.id === 'deep')?.orderDepth).toBe('deep');
    expect(rows.find((r) => r.id === 'thin')?.orderDepth).toBe('thin');
  });

  it('passes custom thresholds through to the classification', () => {
    const rows = rankOpportunities([candidate({ id: 'a', sellDepthIsk: 1_500_000 })], {
      deepAtOrAboveRatio: 1,
      thinBelowRatio: 0.5,
    });
    expect(rows[0]!.orderDepth).toBe('deep');
  });
});
