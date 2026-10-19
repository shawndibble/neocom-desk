import { describe, expect, it } from 'vitest';
import {
  backwardBucketSums,
  dailyBalanceSeries,
  journalCoverageDays,
  withinRange,
} from './chartSeries';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('dailyBalanceSeries', () => {
  it('carries a balance forward across days with no entries', () => {
    const series = dailyBalanceSeries(
      new Map([
        ['2026-10-08', 100],
        ['2026-10-10', 140],
      ]),
      '2026-10-11',
      4
    );
    expect(series.days).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(series.values).toEqual([100, 100, 140, 140]);
  });

  it('leaves out days before the first known balance rather than drawing zero', () => {
    const series = dailyBalanceSeries(new Map([['2026-10-10', 140]]), '2026-10-11', 5);
    expect(series.days).toEqual(['2026-10-10', '2026-10-11']);
    expect(series.values).toEqual([140, 140]);
  });

  it('starts the window from the balance held just before it', () => {
    const series = dailyBalanceSeries(new Map([['2026-09-01', 70]]), '2026-10-11', 3);
    expect(series.values).toEqual([70, 70, 70]);
  });

  it('is empty with no balances at all', () => {
    expect(dailyBalanceSeries(new Map(), '2026-10-11', 7)).toEqual({ days: [], values: [] });
  });
});

describe('withinRange', () => {
  it('keeps entries from the last N days, by their own date', () => {
    const entries = [
      { date: new Date(NOW - 2 * DAY).toISOString() },
      { date: new Date(NOW - 10 * DAY).toISOString() },
    ];
    expect(withinRange(entries, NOW, 7)).toHaveLength(1);
    expect(withinRange(entries, NOW, 30)).toHaveLength(2);
  });
});

describe('journalCoverageDays', () => {
  it('is how far back the oldest entry reaches, in whole days', () => {
    expect(journalCoverageDays([{ date: new Date(NOW - 29.5 * DAY).toISOString() }], NOW)).toBe(30);
  });

  it('is zero for an empty journal', () => {
    expect(journalCoverageDays([], NOW)).toBe(0);
  });
});

describe('backwardBucketSums', () => {
  it('sums into week buckets ending now, oldest first', () => {
    const items = [
      { at: NOW - 1 * DAY, v: 10 },
      { at: NOW - 3 * DAY, v: 5 },
      { at: NOW - 8 * DAY, v: 7 },
      { at: NOW - 40 * DAY, v: 99 },
    ];
    const sums = backwardBucketSums(
      items,
      (i) => i.at,
      (i) => i.v,
      NOW,
      7 * DAY,
      3
    );
    expect(sums).toEqual([0, 7, 15]);
  });

  it('ignores anything in the future', () => {
    const sums = backwardBucketSums(
      [{ at: NOW + DAY, v: 5 }],
      (i) => i.at,
      (i) => i.v,
      NOW,
      7 * DAY,
      2
    );
    expect(sums).toEqual([0, 0]);
  });
});
