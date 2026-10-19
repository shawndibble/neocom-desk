import { describe, it, expect } from 'vitest';
import {
  PRICE_SPIKE_PCT,
  VS_MEDIAN_MIN_TRADED_DAYS,
  isPriceSpike,
  priceVsMedianPct,
} from './priceVsMedian';
import { historyPoint as point } from './__fixtures__/priceHistory';
import { DAY_MS } from '@/lib/age';

/** 2026-10-16 12:00 UTC. */
const NOW = Date.parse('2026-10-16T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);
}

/** One point a day for `days` full days ending yesterday, all at `average`. */
function flatDays(days: number, average: number, startAgo = 1) {
  return Array.from({ length: days }, (_, i) => point({ date: isoDaysAgo(startAgo + i), average }));
}

describe('priceVsMedianPct', () => {
  it('is 0 when the latest day sits on the median', () => {
    expect(priceVsMedianPct(flatDays(60, 100), NOW)).toBe(0);
  });

  it('reads a spike above the median as a positive percent', () => {
    const points = [point({ date: isoDaysAgo(1), average: 135 }), ...flatDays(59, 100, 2)];
    expect(priceVsMedianPct(points, NOW)).toBeCloseTo(35);
  });

  it('reads a dip below the median as a negative percent', () => {
    const points = [point({ date: isoDaysAgo(1), average: 88 }), ...flatDays(59, 100, 2)];
    expect(priceVsMedianPct(points, NOW)).toBeCloseTo(-12);
  });

  it('takes the median over the last 90 days only, ignoring older history', () => {
    const points = [...flatDays(60, 100), ...flatDays(200, 1_000, 91)];
    expect(priceVsMedianPct(points, NOW)).toBe(0);
  });

  it('is null when the item traded on too few days in the window', () => {
    const tooFew = flatDays(VS_MEDIAN_MIN_TRADED_DAYS - 1, 100);
    expect(priceVsMedianPct(tooFew, NOW)).toBeNull();
    expect(priceVsMedianPct(flatDays(VS_MEDIAN_MIN_TRADED_DAYS, 100), NOW)).toBe(0);
  });

  it('does not count days older than 90 toward the minimum', () => {
    const points = [...flatDays(VS_MEDIAN_MIN_TRADED_DAYS - 1, 100), ...flatDays(300, 100, 91)];
    expect(priceVsMedianPct(points, NOW)).toBeNull();
  });

  it('accepts the day before yesterday as latest, before ESI publishes yesterday', () => {
    const points = [point({ date: isoDaysAgo(2), average: 120 }), ...flatDays(59, 100, 3)];
    expect(priceVsMedianPct(points, NOW)).toBeCloseTo(20);
  });

  it('is null when the latest full day is missing (no trade for longer than that)', () => {
    expect(priceVsMedianPct(flatDays(60, 100, 3), NOW)).toBeNull();
  });

  it("ignores today's partial day", () => {
    const points = [point({ date: isoDaysAgo(0), average: 500 }), ...flatDays(60, 100)];
    expect(priceVsMedianPct(points, NOW)).toBe(0);
  });

  it('is null for an empty history', () => {
    expect(priceVsMedianPct([], NOW)).toBeNull();
  });
});

describe('isPriceSpike', () => {
  it('flags from the threshold up, on the rounded percent shown', () => {
    expect(isPriceSpike(PRICE_SPIKE_PCT)).toBe(true);
    expect(isPriceSpike(19.6)).toBe(true);
    expect(isPriceSpike(19.4)).toBe(false);
    expect(isPriceSpike(-35)).toBe(false);
    expect(isPriceSpike(null)).toBe(false);
  });
});
