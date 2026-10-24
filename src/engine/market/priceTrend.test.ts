import { describe, expect, it } from 'vitest';
import type { MarketHistoryPoint } from './priceHistory';
import {
  alignTrendSeries,
  indexToStart,
  isPricedDay,
  percentChange,
  trailingAverage,
} from './priceTrend';

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

  it('is all gaps when no value is positive; a leading zero is a gap, not the base', () => {
    expect(indexToStart([0, 5])).toEqual([null, 100]);
    expect(indexToStart([0, 0])).toEqual([null, null]);
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

describe('days with no usable average', () => {
  it('recognises a priced day', () => {
    expect(isPricedDay(pt('2026-10-01', 5))).toBe(true);
    expect(isPricedDay(pt('2026-10-01', 0))).toBe(false);
    expect(isPricedDay(pt('2026-10-01', -1))).toBe(false);
    expect(isPricedDay(pt('2026-10-01', Number.NaN))).toBe(false);
    expect(isPricedDay(pt('2026-10-01', Number.POSITIVE_INFINITY))).toBe(false);
  });

  it('percentChange never reads a zero-average newest day as a -100% crash', () => {
    const points = [pt('2026-10-01', 100), pt('2026-10-17', 150), pt('2026-10-24', 0)];
    expect(percentChange(points, 7)).toBeCloseTo(0.5); // the 17th is the newest priced day
    expect(percentChange([pt('2026-10-01', 100), pt('2026-10-24', 0)], 7)).toBeNull();
  });

  it('percentChange skips a zero-average base day for the last priced day before it', () => {
    const points = [pt('2026-10-10', 10), pt('2026-10-17', 0), pt('2026-10-24', 12)];
    expect(percentChange(points, 7)).toBeCloseTo(0.2);
  });

  it('indexToStart treats a non-finite or non-positive value as a gap', () => {
    expect(indexToStart([null, 50, 0, 100])).toEqual([null, 100, null, 200]);
    expect(indexToStart([Number.NaN, 50])).toEqual([null, 100]);
  });

  it('alignTrendSeries leaves a zero-average day as a gap and does not make it an axis day', () => {
    const a = [pt('2026-10-22', 4), pt('2026-10-23', 0), pt('2026-10-24', 6)];
    const b = [pt('2026-10-23', 0)];
    const out = alignTrendSeries([a, b], 7);
    expect(out.dates).toEqual(['2026-10-22', '2026-10-24']);
    expect(out.values).toEqual([
      [4, 6],
      [null, null],
    ]);
  });
});

describe('trailingAverage', () => {
  it('averages the window ending at each day, ignoring gaps', () => {
    expect(trailingAverage([10, 20, null, 30], 3)).toEqual([10, 15, 15, 25]);
  });

  it('plots nothing until a value exists in the window', () => {
    expect(trailingAverage([null, null, 4, null, null, null], 2)).toEqual([
      null,
      null,
      4,
      4,
      null,
      null,
    ]);
  });

  it('keeps a window of 1 as the input', () => {
    expect(trailingAverage([1, null, 3], 1)).toEqual([1, null, 3]);
  });
});
