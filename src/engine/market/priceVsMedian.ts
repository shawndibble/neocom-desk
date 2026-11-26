import { median } from '../math';
import type { MarketHistoryPoint } from './priceHistory';
import { DAY_MS } from '@/lib/age';

export const VS_MEDIAN_WINDOW_DAYS = 90;

export const VS_MEDIAN_MIN_TRADED_DAYS = 30;

export const VS_MEDIAN_MAX_LATEST_AGE_DAYS = 2;

export const PRICE_SPIKE_PCT = 20;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

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

export function isPriceSpike(pct: number | null): boolean {
  return pct !== null && Math.round(pct) >= PRICE_SPIKE_PCT;
}

export function isPriceDrop(pct: number | null): boolean {
  return pct !== null && Math.round(pct) <= -PRICE_SPIKE_PCT;
}

export function isPriceFlagged(pct: number | null | undefined): pct is number {
  return pct != null && (isPriceSpike(pct) || isPriceDrop(pct));
}
