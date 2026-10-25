import { describe, expect, it } from 'vitest';
import { combineProfit, profitBuckets, type SourceProfit } from './profitCombine';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const ago = (days: number) => NOW - days * DAY;

const source = (over: Partial<SourceProfit> = {}): SourceProfit => ({
  total: 0,
  previous: null,
  points: [],
  rows: [],
  ...over,
});

describe('profitBuckets', () => {
  it('draws days for a week and weeks for anything longer', () => {
    expect(profitBuckets(7)).toEqual({ daily: true, bucketMs: DAY, buckets: 7 });
    expect(profitBuckets(30)).toEqual({ daily: false, bucketMs: 7 * DAY, buckets: 5 });
    expect(profitBuckets(90)).toEqual({ daily: false, bucketMs: 7 * DAY, buckets: 13 });
  });
});

describe('combineProfit', () => {
  it('sums the two totals', () => {
    const out = combineProfit(source({ total: 100 }), source({ total: -30 }), NOW, 30);
    expect(out.total).toBe(70);
  });

  it('compares with the window before when either source had one, a quiet source counting 0', () => {
    const both = combineProfit(
      source({ total: 100, previous: 40 }),
      source({ total: 50, previous: 10 }),
      NOW,
      30
    );
    expect(both.delta).toBe(100);
    const noTradesBefore = combineProfit(
      source({ total: 100, previous: 40 }),
      source({ total: 50, previous: null }),
      NOW,
      30
    );
    expect(noTradesBefore.delta).toBe(110);
    const noBuildsBefore = combineProfit(
      source({ total: 100, previous: null }),
      source({ total: 50, previous: 10 }),
      NOW,
      30
    );
    expect(noBuildsBefore.delta).toBe(140);
    expect(combineProfit(source({ total: 100 }), source({ total: 50 }), NOW, 30).delta).toBeNull();
  });

  it('leaves trading out of the comparison when it cannot be read', () => {
    const out = combineProfit(source({ total: 100, previous: 40 }), null, NOW, 30);
    expect(out.total).toBe(100);
    expect(out.delta).toBe(60);
    expect(combineProfit(source({ total: 100 }), null, NOW, 30).delta).toBeNull();
  });

  it("returns each source's own total", () => {
    const out = combineProfit(source({ total: 100 }), source({ total: -30 }), NOW, 30);
    expect(out.totals).toEqual({ builds: 100, trading: -30 });
    expect(combineProfit(source({ total: 100 }), null, NOW, 30).totals).toEqual({
      builds: 100,
      trading: 0,
    });
  });

  it('buckets both series on the same periods, oldest first, with their sum', () => {
    const out = combineProfit(
      source({
        points: [
          { at: ago(0.5), profit: 10 },
          { at: ago(3.5), profit: 5 },
        ],
      }),
      source({
        points: [
          { at: ago(0.2), profit: -4 },
          { at: ago(6.5), profit: 7 },
          // Older than the first bucket: left out.
          { at: ago(8), profit: 1000 },
        ],
      }),
      NOW,
      7
    );
    expect(out.buckets).toEqual({ daily: true, bucketMs: DAY, buckets: 7 });
    expect(out.series.builds).toEqual([0, 0, 0, 5, 0, 0, 10]);
    expect(out.series.trading).toEqual([7, 0, 0, 0, 0, 0, -4]);
    expect(out.series.total).toEqual([7, 0, 0, 5, 0, 0, 6]);
  });

  it('draws weeks over a longer range', () => {
    const out = combineProfit(
      source({ points: [{ at: ago(8), profit: 3 }] }),
      source({ points: [{ at: ago(1), profit: 2 }] }),
      NOW,
      30
    );
    expect(out.series.builds).toEqual([0, 0, 0, 3, 0]);
    expect(out.series.trading).toEqual([0, 0, 0, 0, 2]);
  });

  it('draws trading as zeros when it cannot be read', () => {
    const out = combineProfit(source({ points: [{ at: ago(1), profit: 2 }] }), null, NOW, 7);
    expect(out.series.trading).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(out.series.total).toEqual(out.series.builds);
  });

  it('tags each row with its source and sorts by profit, unknown margins last', () => {
    const out = combineProfit(
      source({
        rows: [
          { key: '1', name: 'Rifter', profit: 50 },
          { key: '2', name: 'Gila', profit: -10 },
        ],
      }),
      source({
        rows: [
          { key: '1', name: 'Tritanium', profit: 80 },
          { key: '3', name: 'Plex', profit: null },
          { key: '4', name: 'Damage Control II', profit: 0 },
        ],
      }),
      NOW,
      30
    );
    expect(out.rows.map((r) => `${r.source}:${r.name}`)).toEqual([
      'trading:Tritanium',
      'builds:Rifter',
      'trading:Damage Control II',
      'builds:Gila',
      'trading:Plex',
    ]);
  });
});
