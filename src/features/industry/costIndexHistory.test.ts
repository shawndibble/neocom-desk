import { describe, it, expect } from 'vitest';
import { costIndexTrend, esiActivityName, parseCostIndexHistory } from './costIndexHistory';

function days(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
  );
}

const raw = (n: number, series: Array<number | null>) => ({
  systemId: 30000142,
  lastSyncedAt: 1_700_000_000_000,
  dates: days(n),
  activities: { manufacturing: series },
});

describe('parseCostIndexHistory', () => {
  it('accepts the R2 shape', () => {
    const parsed = parseCostIndexHistory(raw(3, [0.01, null, 0.02]));
    expect(parsed?.systemId).toBe(30000142);
    expect(parsed?.activities.manufacturing).toEqual([0.01, null, 0.02]);
  });
  it('rejects junk and misaligned series', () => {
    expect(parseCostIndexHistory(null)).toBeNull();
    expect(parseCostIndexHistory({})).toBeNull();
    expect(parseCostIndexHistory(raw(3, [0.01]))).toBeNull();
    expect(parseCostIndexHistory({ ...raw(2, [1, 2]), lastSyncedAt: 'x' })).toBeNull();
    expect(parseCostIndexHistory({ ...raw(2, [1, 2]), dates: [1, 2] })).toBeNull();
  });
});

describe('costIndexTrend', () => {
  it('reads 7d ago and today', () => {
    const series = Array.from({ length: 10 }, (_, i) => 0.03 + i * 0.001);
    const trend = costIndexTrend(parseCostIndexHistory(raw(10, series))!, 'manufacturing');
    expect(trend?.points).toHaveLength(10);
    expect(trend?.today).toBeCloseTo(0.039);
    expect(trend?.weekAgo).toBeCloseTo(0.032);
  });
  it('is null under 7 days of data, ignoring gaps', () => {
    expect(
      costIndexTrend(parseCostIndexHistory(raw(6, [1, 1, 1, 1, 1, 1]))!, 'manufacturing')
    ).toBeNull();
    expect(
      costIndexTrend(
        parseCostIndexHistory(raw(8, [1, null, 1, 1, null, 1, 1, null]))!,
        'manufacturing'
      )
    ).toBeNull();
  });
  it('is null for an activity the object lacks', () => {
    expect(
      costIndexTrend(parseCostIndexHistory(raw(8, Array(8).fill(0.02)))!, 'reaction')
    ).toBeNull();
  });
});

describe('esiActivityName', () => {
  it('maps the plan activity to ESI names', () => {
    expect(esiActivityName('manufacturing')).toBe('manufacturing');
    expect(esiActivityName('reaction')).toBe('reaction');
  });
});
