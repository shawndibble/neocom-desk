import { sortPriceHistory, type MarketHistoryPoint } from './priceHistory';
import { shiftUtcDate } from '@/engine/localDay';

export function isPricedDay(point: MarketHistoryPoint): boolean {
  return Number.isFinite(point.average) && point.average > 0;
}

export function percentChange(points: readonly MarketHistoryPoint[], days: number): number | null {
  const sorted = sortPriceHistory(points).filter(isPricedDay);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const cutoff = shiftUtcDate(latest.date, -days);
  let base: MarketHistoryPoint | undefined;
  for (const p of sorted) if (p.date <= cutoff) base = p;
  if (!base) return null;
  return latest.average / base.average - 1;
}

export function indexToStart(values: readonly (number | null)[]): (number | null)[] {
  const usable = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;
  const first = values.find(usable);
  if (first === undefined) return values.map(() => null);
  return values.map((v) => (usable(v) ? (v / first) * 100 : null));
}

export interface TrendAxis {
  dates: string[];
  values: (number | null)[][];
}

export function alignTrendSeries(
  rawSeries: readonly (readonly MarketHistoryPoint[])[],
  days: number
): TrendAxis {
  const series = rawSeries.map((s) => s.filter(isPricedDay));
  const newest = series
    .flatMap((s) => s.map((p) => p.date))
    .reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);
  if (newest === null) return { dates: [], values: series.map(() => []) };
  const from = shiftUtcDate(newest, -(days - 1));
  const dates = [
    ...new Set(series.flatMap((s) => s.map((p) => p.date)).filter((d) => d >= from)),
  ].sort();
  return {
    dates,
    values: series.map((s) => {
      const byDate = new Map(s.map((p) => [p.date, p.average]));
      return dates.map((d) => byDate.get(d) ?? null);
    }),
  };
}

export function trailingAverage(
  values: readonly (number | null)[],
  window: number
): (number | null)[] {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = values[j];
      if (v !== null && v !== undefined) {
        sum += v;
        count++;
      }
    }
    return count === 0 ? null : sum / count;
  });
}
