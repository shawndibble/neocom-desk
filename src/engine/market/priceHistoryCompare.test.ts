import { describe, it, expect } from 'vitest';
import {
  MAX_COMPARE_REGIONS,
  joinRegionAverages,
  normalizeCompareRegions,
  toggleCompareRegion,
} from './priceHistoryCompare';
import { historyPoint as point } from './__fixtures__/priceHistory';

describe('normalizeCompareRegions', () => {
  it('drops the primary region, duplicates, and anything past the cap, keeping pick order', () => {
    expect(normalizeCompareRegions([3, 1, 3, 2, 4, 5, 6], 2)).toEqual([3, 1, 4, 5]);
  });

  it('caps at MAX_COMPARE_REGIONS', () => {
    expect(MAX_COMPARE_REGIONS).toBe(4);
    expect(normalizeCompareRegions([1, 2, 3, 4, 5], 99)).toHaveLength(4);
  });
});

describe('toggleCompareRegion', () => {
  it('appends an unpicked region at the end', () => {
    expect(toggleCompareRegion([3, 1], 7)).toEqual([3, 1, 7]);
  });

  it('removes a picked region without reordering the rest', () => {
    expect(toggleCompareRegion([3, 1, 7], 1)).toEqual([3, 7]);
  });

  it('ignores a fifth pick rather than evicting one the reader chose', () => {
    expect(toggleCompareRegion([1, 2, 3, 4], 5)).toEqual([1, 2, 3, 4]);
  });
});

describe('joinRegionAverages', () => {
  it('returns the primary days unchanged when there is nothing to compare', () => {
    const primary = [point({ date: '2026-08-01' }), point({ date: '2026-08-02' })];
    expect(joinRegionAverages(primary, [])).toEqual([
      { date: '2026-08-01', primary: primary[0], averages: {} },
      { date: '2026-08-02', primary: primary[1], averages: {} },
    ]);
  });

  it('attaches each region average to its day, keyed by region id', () => {
    const primary = [point({ date: '2026-08-01', average: 10 })];
    const joined = joinRegionAverages(primary, [
      { regionId: 7, points: [{ date: '2026-08-01', average: 11 }] },
      { regionId: 8, points: [{ date: '2026-08-01', average: 12 }] },
    ]);
    expect(joined).toEqual([
      { date: '2026-08-01', primary: primary[0], averages: { 7: 11, 8: 12 } },
    ]);
  });

  it('keeps days only a comparison region traded on, in date order, with no primary', () => {
    const primary = [point({ date: '2026-08-01' }), point({ date: '2026-08-03' })];
    const joined = joinRegionAverages(primary, [
      { regionId: 7, points: [{ date: '2026-08-02', average: 5 }] },
    ]);
    expect(joined.map((d) => d.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(joined[1]).toEqual({ date: '2026-08-02', primary: undefined, averages: { 7: 5 } });
    expect(joined[0].averages).toEqual({});
  });
});
