/**
 * Daily open buy and sell prices for one item in one region: the read half of
 * the `syncMarketOpenPrices` Cloud Function (docs/context/decisions/
 * 20261018-121126-price-history-draws-daily-open-buy-and-sell.md). One
 * document per `<regionId>_<typeId>`, public to read by id and never listed,
 * so — like `workbenchFits.ts` — this needs no Firebase session.
 *
 * Never fails the history panel: a missing document (an untracked region, or
 * one the backfill has not reached), an unconfigured Firebase and an offline
 * client all come back as `null`, and the chart falls back to ESI's average
 * line. Only a good answer (including "no such document") is held, per
 * region+type, so reopening the panel costs no second read; a failure is
 * retried the next time.
 */
import { doc, getDoc } from 'firebase/firestore/lite';
import { isSyncConfigured } from '@/app/syncStatus';
import { getSyncFirestore } from '@/sync/firebaseApp';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';

/** Mirrors `MARKET_OPEN_PRICES_COLLECTION` on the Functions side. */
export const MARKET_OPEN_PRICES_COLLECTION = 'marketOpenPrices';

/** The backend publishes once a day. */
const CACHE_TTL_MS = 60 * 60_000;

function isNumberOrNullArray(value: unknown): value is (number | null)[] {
  return Array.isArray(value) && value.every((v) => v === null || typeof v === 'number');
}

/** The stored document as a series, or null when it is not shaped like one. Mirrors the writer's layout. */
export function parseOpenPriceSeries(data: unknown): OpenPriceSeries | null {
  if (typeof data !== 'object' || data === null) return null;
  const { dates, buy, sell } = data as Record<string, unknown>;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (!isNumberOrNullArray(buy) || !isNumberOrNullArray(sell)) return null;
  if (dates.length === 0) return null;
  return { dates: dates as string[], buy, sell };
}

const cache = new Map<string, { at: number; series: OpenPriceSeries | null }>();

/** For tests: forget every cached series. */
export function resetMarketOpenPricesCache(): void {
  cache.clear();
}

/** The item's open-price series in the region, or null for "none to draw". Never throws. */
export async function loadMarketOpenPrices(
  regionId: number,
  typeId: number,
  now: number = Date.now()
): Promise<OpenPriceSeries | null> {
  const key = `${regionId}_${typeId}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.series;
  if (!isSyncConfigured()) return null;
  try {
    const snapshot = await getDoc(doc(getSyncFirestore(), MARKET_OPEN_PRICES_COLLECTION, key));
    const series = snapshot.exists() ? parseOpenPriceSeries(snapshot.data()) : null;
    cache.set(key, { at: now, series });
    return series;
  } catch {
    return null;
  }
}
