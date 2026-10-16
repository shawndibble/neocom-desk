import { describe, expect, it } from 'vitest';
import {
  accountCost,
  accountsCovered,
  nextAccountGap,
  omegaPeriods,
  referenceLevels,
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

describe('referenceLevels', () => {
  it('runs 1x to one above the tallest bar', () => {
    expect(referenceLevels([1.2e9, 0.3e9], 1e9)).toEqual([1, 2]);
    expect(referenceLevels([2.5e9], 1e9)).toEqual([1, 2, 3]);
  });
  it('keeps one line when nothing is positive', () => {
    expect(referenceLevels([-1, 0], 1e9)).toEqual([1]);
    expect(referenceLevels([], 1e9)).toEqual([1]);
  });
  it('is capped', () => expect(referenceLevels([1e12], 1e9).length).toBe(12));
});

describe('omegaPeriods', () => {
  it('buckets rolling 30 UTC-day periods; the newest holds today', () => {
    const rows = [row(0, 100), row(29, 50), row(30, 7), row(59, 3)];
    const periods = omegaPeriods(rows, NOW, new Date(NOW - 59 * DAY).getTime());
    expect(periods.map((p) => p.net)).toEqual([10, 150]);
    expect(periods[1]!.endMs).toBe(Date.parse('2026-10-17T00:00:00Z'));
    expect(periods[1]!.startMs).toBe(Date.parse('2026-09-17T00:00:00Z'));
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
      NOW - 5 * DAY
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
      NOW - 5 * DAY
    );
    expect(p!.plexSpent).toBe(400);
  });

  it('marks a period that starts before history begins as partial', () => {
    const periods = omegaPeriods([row(0, 1), row(40, 1)], NOW, NOW - 40 * DAY);
    expect(periods.map((p) => p.partial)).toEqual([true, false]);
    const full = omegaPeriods([row(0, 1)], NOW, Date.parse('2026-09-17T00:00:00Z'));
    expect(full[0]!.partial).toBe(false);
  });

  it('does not make periods wholly before history', () => {
    expect(omegaPeriods([row(0, 1)], NOW, NOW - 3 * DAY)).toHaveLength(1);
  });

  it('is empty with no history start', () => expect(omegaPeriods([], NOW, null)).toEqual([]));

  it('ignores rows without an amount or in the future', () => {
    const [p] = omegaPeriods(
      [{ date: new Date(NOW).toISOString() }, row(-5, 99), row(1, 4)],
      NOW,
      NOW - DAY
    );
    expect(p!.net).toBe(4);
  });
});
