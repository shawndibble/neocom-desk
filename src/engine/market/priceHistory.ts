import { DAY_MS } from '@/lib/age';
import { median } from '../math';
import { utcDay } from '../localDay';

export interface MarketHistoryPoint {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  volume: number;
  orderCount: number;
}

export function sortPriceHistory(points: readonly MarketHistoryPoint[]): MarketHistoryPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

export type PriceHistoryRange = '7d' | '30d' | '90d' | '1y';

export const PRICE_HISTORY_RANGES: readonly PriceHistoryRange[] = ['7d', '30d', '90d', '1y'];

const RANGE_DAYS: Record<PriceHistoryRange, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

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
  hi: number;
  lo: number;
  median: number;
  totalVolume: number;
  meanOrderCount: number;
}

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

export function summarizePriceHistory(
  points: readonly MarketHistoryPoint[],
  windowDays: number
): PriceHistorySummary | null {
  if (points.length === 0) return null;
  const medianDay = median(points.map((p) => p.average));
  let totalVolume = 0;
  let totalOrderCount = 0;
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
