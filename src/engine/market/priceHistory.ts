/**
 * Price-history reduction: sorts ESI's daily market-history rows into
 * chronological order for the chart. Pure — callers adapt the ESI response
 * shape at the boundary. ESI documents no ordering guarantee for
 * `/markets/{region_id}/history`.
 */

import { DAY_MS } from '@/lib/age';
import { median } from '../math';
import { utcDay } from '../localDay';

export interface MarketHistoryPoint {
  date: string;
  /** Volume-weighted mean of the day's fills, as ESI reports it. */
  average: number;
  /** The day's own extremes — the prices something actually changed hands at, which `average` alone hides. */
  highest: number;
  lowest: number;
  /** Units traded that day. */
  volume: number;
  /** Orders that ticked that day (ESI's `order_count`) — how many parties were trading, not how much moved. */
  orderCount: number;
}

/** Sorts by date ascending, oldest first — the order the chart draws left to right. */
export function sortPriceHistory(points: readonly MarketHistoryPoint[]): MarketHistoryPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

export type PriceHistoryRange = '7d' | '30d' | '90d' | '1y';

export const PRICE_HISTORY_RANGES: readonly PriceHistoryRange[] = ['7d', '30d', '90d', '1y'];

const RANGE_DAYS: Record<PriceHistoryRange, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/**
 * Keeps points within `range` of `now`, inclusive. Compares bare date strings
 * (ESI history has no time-of-day component) rather than parsing to a `Date`,
 * so this needs no timezone handling of its own.
 */
export function filterPriceHistoryRange<T extends { date: string }>(
  points: readonly T[],
  range: PriceHistoryRange,
  now: Date
): T[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  const cutoffDate = utcDay(cutoff.getTime());
  return points.filter((p) => p.date >= cutoffDate);
}

export interface PriceHistorySummary {
  /**
   * The highest and lowest price anything traded at anywhere in the range,
   * from the days' own `highest`/`lowest` — not the extremes of the daily
   * average, which is what these were before the band existed. A day whose
   * average sat at 9,000 while a spike filled at 14,000 now reports 14,000,
   * because that is the number a trader is asking this column for.
   */
  hi: number;
  lo: number;
  /** Median of the daily *average* — the middle of a typical day, which no single day's extreme should move. */
  median: number;
  /** Units traded across the whole range. */
  totalVolume: number;
  /**
   * Mean daily order count over the whole window, left unrounded. ESI omits a
   * day nothing traded, so that day counts as zero orders: ten orders on 3 of
   * 90 days is 0.11 a day, not the 3.3 that averaging over traded days gives.
   * Unrounded — the caller formats it. Rounding
   * here turned a real but thin market ("10 orders across 90 days") into a
   * flat `0`, which is the fabricated figure the null return above exists to
   * avoid.
   */
  meanOrderCount: number;
}

/**
 * Calendar days the "orders per day" mean divides by: the range's days, or the
 * days since the series' first trade where the market is newer than the range
 * (so a new market is not diluted by days before it existed). `firstDate` is
 * the first point of the full, unfiltered series. At least 1.
 */
export function orderCountWindowDays(
  range: PriceHistoryRange,
  firstDate: string,
  now: Date
): number {
  const first = Date.parse(`${firstDate}T00:00:00Z`);
  const today = Date.parse(`${utcDay(now.getTime())}T00:00:00Z`);
  const sinceFirst = Number.isFinite(first) ? Math.round((today - first) / DAY_MS) : Infinity;
  return Math.max(1, Math.min(RANGE_DAYS[range], sinceFirst));
}

/**
 * Range hi/lo, median day, total volume and mean daily order count over
 * `windowDays` calendar days (see `orderCountWindowDays`). Null for an empty
 * range — never a fabricated 0.
 */
export function summarizePriceHistory(
  points: readonly MarketHistoryPoint[],
  windowDays: number
): PriceHistorySummary | null {
  if (points.length === 0) return null;
  const medianDay = median(points.map((p) => p.average));
  let totalVolume = 0;
  let totalOrderCount = 0;
  // `Math.min`/`Math.max` rather than a seeded comparison: a comparison seeded
  // from `points[0]` answers differently depending on *where* a malformed day
  // sits — `undefined > hi` is false, so a bad value at index 0 sticks and a
  // bad value later vanishes. These two propagate NaN from any position, so a
  // malformed response fails the same way wherever the bad day landed.
  let hi = -Infinity;
  let lo = Infinity;
  for (const p of points) {
    totalVolume += p.volume;
    totalOrderCount += p.orderCount;
    hi = Math.max(hi, p.highest);
    lo = Math.min(lo, p.lowest);
  }
  return {
    hi,
    lo,
    median: medianDay,
    totalVolume,
    meanOrderCount: totalOrderCount / Math.max(1, windowDays),
  };
}

export interface MovingAveragePoint {
  date: string;
  average: number;
}

/**
 * Trailing simple moving average of the daily average price, over `points`
 * as given — callers must pass the full unfiltered series, not one already
 * cut to a display range, or early points in that range would silently
 * average over fewer than `windowDays` real days. Skips any point without
 * `windowDays` real days of prior history rather than averaging a partial
 * window, so a series shorter than `windowDays` returns empty.
 */
export function movingAverage(
  points: readonly MovingAveragePoint[],
  windowDays: number
): MovingAveragePoint[] {
  if (windowDays <= 0) return [];
  const result: MovingAveragePoint[] = [];
  for (let i = windowDays - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = i - windowDays + 1; j <= i; j++) sum += points[j].average;
    result.push({ date: points[i].date, average: sum / windowDays });
  }
  return result;
}
