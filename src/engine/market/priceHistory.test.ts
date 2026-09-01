import { describe, it, expect } from 'vitest';
import { sortPriceHistory } from './priceHistory';

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
