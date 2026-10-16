import { describe, expect, it } from 'vitest';
import {
  accountCost,
  accountsCovered,
  drawnLevels,
  nextAccountGap,
  omegaPeriods,
  referenceLevels,
  type HistoryCoverage,
  type IncomeRow,
} from './omegaCoverage';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-16T12:00:00Z');
const row = (daysAgo: number, amount: number, over: Partial<IncomeRow> = {}): IncomeRow => ({
  date: new Date(NOW - daysAgo * DAY).toISOString(),
  amount,
  ...over,
});

describe('accountCost', () => {
  it('multiplies PLEX by price', () => expect(accountCost(2_000_000, 500)).toBe(1_000_000_000));
  it('is null without a usable price or plan', () => {
    expect(accountCost(null, 500)).toBeNull();
    expect(accountCost(0, 500)).toBeNull();
    expect(accountCost(2_000_000, 0)).toBeNull();
  });
});

describe('accountsCovered and nextAccountGap', () => {
  it('rounds down and reports the gap to the next account', () => {
    expect(accountsCovered(1.2e9, 1e9)).toBe(1);
    expect(nextAccountGap(1.2e9, 1e9)).toBeCloseTo(0.8e9);
  });
  it('covers none at or below zero, and the gap is the full cost plus the shortfall', () => {
    expect(accountsCovered(-5, 10)).toBe(0);
    expect(accountsCovered(0, 10)).toBe(0);
    expect(nextAccountGap(-5, 10)).toBe(15);
  });
  it('an exact multiple needs a whole further account', () => {
    expect(accountsCovered(2e9, 1e9)).toBe(2);
    expect(nextAccountGap(2e9, 1e9)).toBe(1e9);
  });
});

const since = (daysAgo: number, gaps: HistoryCoverage['gaps'] = []): HistoryCoverage => ({
  since: NOW - daysAgo * DAY,
  gaps,
});

describe('referenceLevels', () => {
  it('runs 1x to one above the tallest bar', () => {
    expect(referenceLevels([1.2e9, 0.3e9], 1e9)).toEqual([1, 2]);
    expect(referenceLevels([2.5e9], 1e9)).toEqual([1, 2, 3]);
  });
  it('keeps one line when nothing is positive', () => {
    expect(referenceLevels([-1, 0], 1e9)).toEqual([1]);
    expect(referenceLevels([], 1e9)).toEqual([1]);
  });
});

describe('drawnLevels', () => {
  const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  it('keeps every line when there are six or fewer', () => {
    expect(drawnLevels(upTo(6))).toEqual(upTo(6));
    expect(drawnLevels(upTo(1))).toEqual([1]);
  });
  it('steps by ceil(n / 6) when there are more', () => {
    expect(drawnLevels(upTo(7))).toEqual([2, 4, 6]);
    expect(drawnLevels(upTo(12))).toEqual([2, 4, 6, 8, 10, 12]);
    expect(drawnLevels(upTo(40))).toEqual([7, 14, 21, 28, 35]);
  });
});

describe('omegaPeriods', () => {
  it('buckets rolling 30-day windows ending now; the newest is the last 30 days', () => {
    const rows = [row(0, 100), row(29, 50), row(31, 7), row(59, 3)];
    const periods = omegaPeriods(rows, NOW, [since(59)]);
    expect(periods.map((p) => p.net)).toEqual([10, 150]);
    expect(periods[1]!.endMs).toBe(NOW);
    expect(periods[1]!.startMs).toBe(NOW - 30 * DAY);
    expect(periods[0]!.endMs).toBe(NOW - 30 * DAY);
  });

  it('leaves own-Character transfers and PLEX buys and sells out of net', () => {
    const periods = omegaPeriods(
      [
        row(1, 1000),
        row(1, 500, { internal: true }),
        row(1, -300, { refKey: 'plex_bought' }),
        row(1, 200, { refKey: 'plex_sold' }),
      ],
      NOW,
      [since(5)]
    );
    expect(periods).toHaveLength(1);
    expect(periods[0]!.net).toBe(1000);
  });

  it('sums ISK spent on PLEX from the bought rows only', () => {
    const [p] = omegaPeriods(
      [
        row(1, -300, { refKey: 'plex_bought' }),
        row(2, -100, { refKey: 'plex_bought' }),
        row(1, 50, { refKey: 'plex_sold' }),
      ],
      NOW,
      [since(5)]
    );
    expect(p!.plexSpent).toBe(400);
  });

  it('marks a period that starts before coverage began as partial', () => {
    const periods = omegaPeriods([row(0, 1), row(40, 1)], NOW, [since(40)]);
    expect(periods.map((p) => p.partial)).toEqual([true, false]);
    expect(omegaPeriods([row(0, 1)], NOW, [since(30)])[0]!.partial).toBe(false);
  });

  it('marks a period overlapping any gap as partial', () => {
    const gap: [number, number] = [NOW - 40 * DAY, NOW - 35 * DAY];
    const periods = omegaPeriods([], NOW, [since(80), since(80, [gap])]);
    expect(periods.map((p) => p.partial)).toEqual([true, true, false]);
  });

  it('is partial when the youngest Character history starts inside the period', () => {
    const periods = omegaPeriods([], NOW, [since(80), since(10)]);
    expect(periods.map((p) => p.partial)).toEqual([true, true, true]);
  });

  it('ignores unparseable coverage and rows', () => {
    const periods = omegaPeriods([{ date: 'nope', amount: 5 }, row(1, 4)], NOW, [
      since(40, [[Number.NaN, 1]]),
      { since: Number.NaN, gaps: [] },
    ]);
    expect(periods.map((p) => p.net)).toEqual([0, 4]);
    expect(periods.map((p) => p.partial)).toEqual([true, false]);
  });

  it('does not make periods wholly before coverage', () => {
    expect(omegaPeriods([row(0, 1)], NOW, [since(3)])).toHaveLength(1);
  });

  it('is empty with no coverage', () => expect(omegaPeriods([], NOW, [])).toEqual([]));

  it('ignores rows without an amount or in the future', () => {
    const [p] = omegaPeriods([{ date: new Date(NOW).toISOString() }, row(-5, 99), row(1, 4)], NOW, [
      since(1),
    ]);
    expect(p!.net).toBe(4);
  });
});
