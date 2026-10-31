/**
 * How far an item's recent price sits from its 90-day median: the latest
 * full day's region daily average against the median of the region's daily
 * averages over the last 90 days. Like with like — both sides are ESI's
 * volume-weighted daily `average`, so a wide-spread item's hub sell price
 * never reads as a spike against a region average it was never comparable
 * to. Pure; the caller supplies the region's history and the clock.
 */
import { median } from '../math';
import type { MarketHistoryPoint } from './priceHistory';
import { DAY_MS } from '@/lib/age';

export const VS_MEDIAN_WINDOW_DAYS = 90;

/**
 * Fewer traded days than this in the window and the figure is blank. ESI's
 * history omits days nothing traded, so a thin item's "median" over a handful
 * of days is noise, not a typical price.
 */
export const VS_MEDIAN_MIN_TRADED_DAYS = 30;

/**
 * The latest full day may be at most this many days old. ESI publishes
 * yesterday only after its daily rollover, so for part of each UTC day the
 * newest row any item has is the day before yesterday; older than that, the
 * item stopped trading and its "latest" price is stale.
 */
export const VS_MEDIAN_MAX_LATEST_AGE_DAYS = 2;

/** At or above this percent over the median, the price is flagged as a spike. */
export const PRICE_SPIKE_PCT = 20;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/**
 * Percent the latest full day's average sits above (+) or below (−) the
 * 90-day median of daily averages. Null when the window holds fewer than
 * `VS_MEDIAN_MIN_TRADED_DAYS` traded days, or the latest full day is older
 * than `VS_MEDIAN_MAX_LATEST_AGE_DAYS`. Today's partial day never counts.
 */
export function priceVsMedianPct(
  points: readonly MarketHistoryPoint[],
  nowMs: number
): number | null {
  const today = Math.floor(nowMs / DAY_MS);
  const window = points.filter((p) => {
    const day = dayNumber(p.date);
    return day < today && day >= today - VS_MEDIAN_WINDOW_DAYS;
  });
  if (window.length < VS_MEDIAN_MIN_TRADED_DAYS) return null;
  const latest = window.reduce((best, p) => (p.date > best.date ? p : best));
  if (today - dayNumber(latest.date) > VS_MEDIAN_MAX_LATEST_AGE_DAYS) return null;
  const typical = median(window.map((p) => p.average));
  if (!(typical > 0)) return null;
  return (latest.average / typical - 1) * 100;
}

/** Whether a percent flags as a spike, judged on the whole percent shown so "+20%" is never left plain. */
export function isPriceSpike(pct: number | null): boolean {
  return pct !== null && Math.round(pct) >= PRICE_SPIKE_PCT;
}

/** Whether a percent flags as a drop: the mirror of `isPriceSpike`, at the negative of the same threshold. */
export function isPriceDrop(pct: number | null): boolean {
  return pct !== null && Math.round(pct) <= -PRICE_SPIKE_PCT;
}

/** Whether a figure earns a flag at all: a spike or a drop. */
export function isPriceFlagged(pct: number | null | undefined): pct is number {
  return pct != null && (isPriceSpike(pct) || isPriceDrop(pct));
}
