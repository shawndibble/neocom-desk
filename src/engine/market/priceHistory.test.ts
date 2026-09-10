import { describe, it, expect } from 'vitest';
import {
  sortPriceHistory,
  filterPriceHistoryRange,
  summarizePriceHistory,
  movingAverage,
} from './priceHistory';

describe('sortPriceHistory', () => {
  it('sorts points chronologically by date', () => {
    const points = [
      { date: '2026-08-30', average: 10, volume: 5 },
      { date: '2026-08-01', average: 9, volume: 3 },
      { date: '2026-08-15', average: 11, volume: 7 },
    ];
    expect(sortPriceHistory(points).map((p) => p.date)).toEqual([
      '2026-08-01',
      '2026-08-15',
      '2026-08-30',
    ]);
  });

  it('does not mutate the input array', () => {
    const points = [
      { date: '2026-08-30', average: 10, volume: 5 },
      { date: '2026-08-01', average: 9, volume: 3 },
    ];
    const original = [...points];
    sortPriceHistory(points);
    expect(points).toEqual(original);
  });

  it('returns an empty array for no history', () => {
    expect(sortPriceHistory([])).toEqual([]);
  });
});

describe('filterPriceHistoryRange', () => {
  const points = [
    { date: '2026-01-01', average: 1, volume: 1 },
    { date: '2026-01-20', average: 2, volume: 2 },
    { date: '2026-02-15', average: 3, volume: 3 },
    { date: '2026-02-28', average: 4, volume: 4 },
  ];
  const now = new Date('2026-03-01T00:00:00Z');

  it('keeps only points within the last 7 days', () => {
    expect(filterPriceHistoryRange(points, '7d', now).map((p) => p.date)).toEqual(['2026-02-28']);
  });

  it('keeps only points within the last 30 days', () => {
    expect(filterPriceHistoryRange(points, '30d', now).map((p) => p.date)).toEqual([
      '2026-02-15',
      '2026-02-28',
    ]);
  });

  it('keeps every point within a 1y range', () => {
    expect(filterPriceHistoryRange(points, '1y', now)).toHaveLength(4);
  });

  it('returns an empty array when nothing falls in range', () => {
    expect(filterPriceHistoryRange([], '30d', now)).toEqual([]);
  });
});

describe('summarizePriceHistory', () => {
  it('reports hi, lo, and median of the average price', () => {
    const points = [
      { date: '2026-01-01', average: 10, volume: 1 },
      { date: '2026-01-02', average: 30, volume: 1 },
      { date: '2026-01-03', average: 20, volume: 1 },
    ];
    expect(summarizePriceHistory(points)).toEqual({ hi: 30, lo: 10, median: 20 });
  });

  it('averages the two middle values for an even count', () => {
    const points = [
      { date: '2026-01-01', average: 10, volume: 1 },
      { date: '2026-01-02', average: 20, volume: 1 },
      { date: '2026-01-03', average: 30, volume: 1 },
      { date: '2026-01-04', average: 40, volume: 1 },
    ];
    expect(summarizePriceHistory(points)).toEqual({ hi: 40, lo: 10, median: 25 });
  });

  it('returns null for an empty range rather than a fabricated zero', () => {
    expect(summarizePriceHistory([])).toBeNull();
  });
});

describe('movingAverage', () => {
  const points = [
    { date: '2026-01-01', average: 10, volume: 1 },
    { date: '2026-01-02', average: 20, volume: 1 },
    { date: '2026-01-03', average: 30, volume: 1 },
    { date: '2026-01-04', average: 40, volume: 1 },
    { date: '2026-01-05', average: 50, volume: 1 },
  ];

  it('omits points until enough real history fills the window', () => {
    expect(movingAverage(points, 3).map((p) => p.date)).toEqual([
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });

  it('averages exactly the trailing window of days, not the whole series', () => {
    expect(movingAverage(points, 3)).toEqual([
      { date: '2026-01-03', average: 20 },
      { date: '2026-01-04', average: 30 },
      { date: '2026-01-05', average: 40 },
    ]);
  });

  it('returns every point when the window is 1', () => {
    expect(movingAverage(points, 1).map((p) => p.average)).toEqual([10, 20, 30, 40, 50]);
  });

  it('returns an empty array when the series has fewer points than the window', () => {
    expect(movingAverage(points, 10)).toEqual([]);
  });

  it('returns an empty array for an empty series', () => {
    expect(movingAverage([], 7)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [...points];
    movingAverage(points, 3);
    expect(points).toEqual(original);
  });
});

describe('filterPriceHistoryRange with a moving-average series', () => {
  it('filters moving-average points by date the same way it filters price points', () => {
    const maPoints = [
      { date: '2026-01-01', average: 15 },
      { date: '2026-02-28', average: 25 },
    ];
    const now = new Date('2026-03-01T00:00:00Z');
    expect(filterPriceHistoryRange(maPoints, '7d', now)).toEqual([
      { date: '2026-02-28', average: 25 },
    ]);
  });
});
