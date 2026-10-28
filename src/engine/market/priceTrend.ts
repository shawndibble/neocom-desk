/**
 * Price trend maths for the Market Trend widget: the change over a window,
 * several items' daily averages laid on one day axis, and the indexed-to-100
 * scale that lets a 5 ISK mineral and a 5M ISK PLEX share a chart. Pure.
 */
import { sortPriceHistory, type MarketHistoryPoint } from './priceHistory';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` shifted by whole days (UTC, so no DST drift). */
export function shiftDay(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** A day whose average is a real price: a row of 0 (or garbage) is a day nothing priced, not a crash. */
export function isPricedDay(point: MarketHistoryPoint): boolean {
  return Number.isFinite(point.average) && point.average > 0;
}

/**
 * Fractional change of the daily average from the last day on or before
 * `days` earlier to the newest day (0.2 = +20%). Anchored on the newest priced row (a zero average is a day with no price),
 * not the clock, because ESI history lags a day. `null` — never 0 — when the
 * history does not reach back that far or the base is not positive.
 */
export function percentChange(points: readonly MarketHistoryPoint[], days: number): number | null {
  const sorted = sortPriceHistory(points).filter(isPricedDay);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const cutoff = shiftDay(latest.date, -days);
  let base: MarketHistoryPoint | undefined;
  for (const p of sorted) if (p.date <= cutoff) base = p;
  if (!base) return null;
  return latest.average / base.average - 1;
}

/** Scales a series to 100 at its first known value; gaps stay gaps. A non-positive value is a gap too, so the base is the first positive value. */
export function indexToStart(values: readonly (number | null)[]): (number | null)[] {
  const usable = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;
  const first = values.find(usable);
  if (first === undefined) return values.map(() => null);
  return values.map((v) => (usable(v) ? (v / first) * 100 : null));
}

export interface TrendAxis {
  /** Oldest first. */
  dates: string[];
  /** One row per input series, one value per date, `null` where that series traded nothing. */
  values: (number | null)[][];
}

/**
 * Daily averages of several series on one day axis: the union of their days,
 * limited to the `days` calendar days ending at the newest day any has.
 */
export function alignTrendSeries(
  rawSeries: readonly (readonly MarketHistoryPoint[])[],
  days: number
): TrendAxis {
  const series = rawSeries.map((s) => s.filter(isPricedDay));
  const newest = series
    .flatMap((s) => s.map((p) => p.date))
    .reduce<string | null>((max, d) => (max === null || d > max ? d : max), null);
  if (newest === null) return { dates: [], values: series.map(() => []) };
  const from = shiftDay(newest, -(days - 1));
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

/**
 * Trailing moving average: each value is the mean of the known values among
 * the last `window` entries (itself included), so a gap day gets a value from
 * its neighbours and nothing plots until one value exists. Smooths daily noise
 * on long ranges. Pure.
 */
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
