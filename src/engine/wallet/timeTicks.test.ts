import { describe, expect, it } from 'vitest';
import { timeAxisTicks } from './timeTicks';

const DAY = 24 * 60 * 60 * 1000;

describe('timeAxisTicks', () => {
  it('returns unique ascending day-boundary ticks in the zone, capped at maxTicks', () => {
    const min = Date.parse('2026-09-01T13:00:00Z');
    const max = Date.parse('2026-09-28T02:00:00Z');
    const { ticks, showTime } = timeAxisTicks(min, max, 'America/New_York', 6);
    expect(showTime).toBe(false);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    for (const t of ticks) {
      // New York midnight in September is 04:00 UTC (EDT).
      expect(new Date(t).toISOString().slice(11)).toBe('04:00:00.000Z');
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    }
  });

  it('follows the zone across a DST change', () => {
    const min = Date.parse('2026-10-30T12:00:00Z');
    const max = Date.parse('2026-11-05T12:00:00Z');
    const { ticks } = timeAxisTicks(min, max, 'America/New_York', 10);
    // Nov 1 2026 is the fall-back day: midnights are 04:00Z before it, 05:00Z after.
    expect(ticks.map((t) => new Date(t).toISOString().slice(11, 13))).toEqual([
      '04',
      '04',
      '05',
      '05',
      '05',
      '05',
    ]);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('uses time-of-day ticks for a span under two days', () => {
    const min = Date.parse('2026-09-21T01:00:00Z');
    const max = min + DAY + 3 * 60 * 60 * 1000;
    const { ticks, showTime } = timeAxisTicks(min, max, 'UTC', 5);
    expect(showTime).toBe(true);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toBe(min);
    expect(ticks.at(-1)).toBe(max);
  });

  it('returns a single tick for a zero-width domain without throwing', () => {
    const at = Date.parse('2026-09-21T10:00:00Z');
    expect(timeAxisTicks(at, at, 'UTC', 5)).toEqual({ ticks: [at], showTime: true });
  });
});
