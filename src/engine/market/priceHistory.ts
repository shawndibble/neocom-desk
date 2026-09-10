/**
 * Price-history reduction: sorts ESI's daily market-history rows into
 * chronological order for the chart. Pure — callers adapt the ESI response
 * shape at the boundary. ESI documents no ordering guarantee for
 * `/markets/{region_id}/history`.
 */

export interface MarketHistoryPoint {
  date: string;
  average: number;
  volume: number;
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
  now: Date = new Date()
): T[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cutoffDate);
}

export interface PriceHistorySummary {
  hi: number;
  lo: number;
  median: number;
}

/** Hi/lo/median of the daily average price. Null for an empty range — never a fabricated 0. */
export function summarizePriceHistory(
  points: readonly MarketHistoryPoint[]
): PriceHistorySummary | null {
  if (points.length === 0) return null;
  const sorted = points.map((p) => p.average).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { hi: sorted[sorted.length - 1], lo: sorted[0], median };
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
  points: readonly MarketHistoryPoint[],
  windowDays: number
): MovingAveragePoint[] {
  const result: MovingAveragePoint[] = [];
  for (let i = windowDays - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = i - windowDays + 1; j <= i; j++) sum += points[j].average;
    result.push({ date: points[i].date, average: sum / windowDays });
  }
  return result;
}
