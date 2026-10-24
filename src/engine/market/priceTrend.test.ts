import { describe, expect, it } from 'vitest';
import type { MarketHistoryPoint } from './priceHistory';
import { alignTrendSeries, indexToStart, percentChange } from './priceTrend';

const pt = (date: string, average: number): MarketHistoryPoint => ({
  date,
  average,
  highest: average,
  lowest: average,
  volume: 1,
  orderCount: 1,
});

describe('percentChange', () => {
  const points = [pt('2026-10-01', 100), pt('2026-10-17', 150), pt('2026-10-24', 180)];

  it('compares the latest day with the last day on or before N days earlier', () => {
    expect(percentChange(points, 7)).toBeCloseTo((180 - 150) / 150);
  });

  it('is unknown, never zero, when history does not reach back far enough', () => {
    expect(percentChange(points, 30)).toBeNull();
  });

  it('anchors on the latest row, not the clock, since ESI lags a day', () => {
    expect(percentChange([pt('2026-10-10', 10), pt('2026-10-20', 12)], 10)).toBeCloseTo(0.2);
  });

  it('is unknown for an empty, zero-based or unsorted-away series', () => {
    expect(percentChange([], 7)).toBeNull();
    expect(percentChange([pt('2026-10-01', 0), pt('2026-10-08', 5)], 7)).toBeNull();
  });

  it('sorts its input first', () => {
    expect(percentChange([pt('2026-10-08', 110), pt('2026-10-01', 100)], 7)).toBeCloseTo(0.1);
  });
});

describe('indexToStart', () => {
  it('scales to 100 at the first known value and keeps gaps', () => {
    expect(indexToStart([null, 50, 75, null, 100])).toEqual([null, 100, 150, null, 200]);
  });

  it('is all gaps when the first value is not positive', () => {
    expect(indexToStart([0, 5])).toEqual([null, null]);
    expect(indexToStart([null, null])).toEqual([null, null]);
  });
});

describe('alignTrendSeries', () => {
  it('lays series on one shared day axis ending at the newest day, windowed to N days', () => {
    const a = [pt('2026-10-22', 1), pt('2026-10-23', 2), pt('2026-10-24', 3)];
    const b = [pt('2026-10-23', 10)];
    const out = alignTrendSeries([a, b], 2);
    expect(out.dates).toEqual(['2026-10-23', '2026-10-24']);
    expect(out.values).toEqual([
      [2, 3],
      [10, null],
    ]);
  });

  it('returns no days when every series is empty', () => {
    expect(alignTrendSeries([[], []], 30)).toEqual({ dates: [], values: [[], []] });
  });
});
