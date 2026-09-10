import { describe, it, expect } from 'vitest';
import { productionProfitHistory, productionProfitTrend } from './productionProfitHistory';

// Local-time constructors, not `Date.parse('...Z')`: `productionProfitHistory`
// buckets by local calendar day the same way `filterProductionRunsByDate`
// does, so a UTC-anchored fixture would give the wrong answer in every
// timezone except UTC+0.
const AUG_10_MORNING = new Date(2026, 7, 10, 9, 0, 0).getTime();
const AUG_10_EVENING = new Date(2026, 7, 10, 21, 0, 0).getTime();
const AUG_11 = new Date(2026, 7, 11, 12, 0, 0).getTime();
const AUG_12 = new Date(2026, 7, 12, 12, 0, 0).getTime();

describe('productionProfitHistory', () => {
  it('returns an empty array for no entries', () => {
    expect(productionProfitHistory([])).toEqual([]);
  });

  it('buckets a single entry as its own point at its full profit', () => {
    const points = productionProfitHistory([{ loggedAt: AUG_10_MORNING, profit: 1_000_000 }]);
    expect(points).toEqual([{ date: '2026-08-10', profit: 1_000_000 }]);
  });

  it('sums same-day entries into one bucket regardless of input order', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_10_EVENING, profit: 500_000 },
      { loggedAt: AUG_10_MORNING, profit: 300_000 },
    ]);
    expect(points).toEqual([{ date: '2026-08-10', profit: 800_000 }]);
  });

  it('sorts distinct days chronologically ascending regardless of input order', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_12, profit: 100 },
      { loggedAt: AUG_10_MORNING, profit: 100 },
      { loggedAt: AUG_11, profit: 100 },
    ]);
    expect(points.map((p) => p.date)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('carries a running cumulative total across day buckets', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_10_MORNING, profit: 1_000_000 },
      { loggedAt: AUG_11, profit: 500_000 },
      { loggedAt: AUG_12, profit: -200_000 },
    ]);
    expect(points).toEqual([
      { date: '2026-08-10', profit: 1_000_000 },
      { date: '2026-08-11', profit: 1_500_000 },
      { date: '2026-08-12', profit: 1_300_000 },
    ]);
  });
});

describe('productionProfitTrend', () => {
  it('is flat for fewer than two points', () => {
    expect(productionProfitTrend([])).toBe('flat');
    expect(productionProfitTrend([{ date: '2026-08-10', profit: 100 }])).toBe('flat');
  });

  it('is up when the last point is higher than the first', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_10_MORNING, profit: 100 },
      { loggedAt: AUG_11, profit: 200 },
    ]);
    expect(productionProfitTrend(points)).toBe('up');
  });

  it('is down when the last point is lower than the first', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_10_MORNING, profit: 200 },
      { loggedAt: AUG_11, profit: -300 },
    ]);
    expect(productionProfitTrend(points)).toBe('down');
  });

  it('is flat when the first and last points are equal', () => {
    const points = productionProfitHistory([
      { loggedAt: AUG_10_MORNING, profit: 100 },
      { loggedAt: AUG_11, profit: 50 },
      { loggedAt: AUG_12, profit: -50 },
    ]);
    expect(productionProfitTrend(points)).toBe('flat');
  });
});
