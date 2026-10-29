/**
 * Price sources behind Fuzzwork (ADR 0002 amendment, docs/context/decisions/
 * *-price-fallback-when-fuzzwork-is-down.md). Fuzzwork is a community service
 * with no SLA, so when it throws, or answers a whole batch with no orders at
 * all, the lookup falls through:
 *
 *   1. ESI region orders for the item, folded to the station. Live and exact,
 *      but one request per type, so only for a small batch.
 *   2. The daily open prices in R2 (hub stations only): yesterday's close, with
 *      no volumes. Flagged stale so the caller can say so and never caches it.
 *
 * Nothing here caches: `prices.ts` owns the TTLs, and wraps this module.
 */
import { getMarketOrders } from '@/esi/endpoints';
import { summarizeStationBook, type StationBook } from '@/engine/market/stationBook';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import {
  fetchAggregates,
  fetchOrderCounts,
  type AggregateScope,
  type HubAggregate,
  type HubOrderCounts,
} from './fuzzwork';
import { TRADE_HUBS } from './hubs';
import { MINUTE_MS, DAY_MS } from '@/lib/age';

/** Past this many types the ESI step is skipped: one request each would eat the error-limit budget. */
export const ESI_FALLBACK_MAX_TYPES = 50;

/** After Fuzzwork throws, go straight to the fallback for this long rather than time out on every ask. */
export const FUZZWORK_BACKOFF_MS = MINUTE_MS;

/** Fan-out for the ESI step; under `ESI_FANOUT_CONCURRENCY` so Sentry's N+1 detector stays quiet. */
const ESI_STEP_CONCURRENCY = Math.min(4, ESI_FANOUT_CONCURRENCY);

export interface FallbackPrices {
  prices: Map<number, HubAggregate>;
  /** Types whose price is yesterday's close from R2, not a live book. */
  stale: ReadonlySet<number>;
}

let fuzzworkDownUntil = 0;

/** Test-only: forget a recorded Fuzzwork outage. */
export function resetPriceFallback(): void {
  fuzzworkDownUntil = 0;
}

function fuzzworkAvailable(nowMs: number): boolean {
  return nowMs >= fuzzworkDownUntil;
}

function markFuzzworkDown(nowMs: number): void {
  fuzzworkDownUntil = nowMs + FUZZWORK_BACKOFF_MS;
}

/** Whether no type in the batch has a price: Fuzzwork up but empty-handed. */
function noPrices(prices: ReadonlyMap<number, HubAggregate>): boolean {
  for (const a of prices.values()) if (a.sellMin !== null || a.buyMax !== null) return false;
  return true;
}

function noCounts(counts: ReadonlyMap<number, HubOrderCounts>): boolean {
  for (const c of counts.values()) if (c.buyOrders > 0 || c.sellOrders > 0) return false;
  return true;
}

/** The region a bare station id sits in, or null (player structure, unreadable snapshot). */
async function regionOfStation(stationId: number): Promise<number | null> {
  const hub = TRADE_HUBS.find((h) => h.stationId === stationId);
  if (hub) return hub.regionId;
  const station = await lookupNpcStation(stationId).catch(() => undefined);
  if (!station) return null;
  const system = await lookupSolarSystem(station.systemId).catch(() => undefined);
  return system?.regionId ?? null;
}

/**
 * Each type's book folded for the location, from ESI. `null` when the step
 * cannot answer: too many types, an unresolvable region, a failed request or a
 * book ESI did not return whole. One partial answer would be a wrong best
 * price, so the step is all or nothing.
 */
async function esiBooks(
  locationId: number,
  typeIds: readonly number[],
  scope: AggregateScope
): Promise<Map<number, StationBook> | null> {
  if (typeIds.length === 0 || typeIds.length > ESI_FALLBACK_MAX_TYPES) return null;
  const regionId = scope === 'region' ? locationId : await regionOfStation(locationId);
  if (regionId === null) return null;
  const books = new Map<number, StationBook>();
  let failed = false;
  try {
    await mapWithConcurrencyLimit(typeIds, ESI_STEP_CONCURRENCY, async (typeId) => {
      // One failure discards the whole step, so stop spending the ESI error budget.
      if (failed) return;
      const { items, truncated } = await getMarketOrders(regionId, typeId);
      if (truncated) throw new Error(`order book ${regionId}:${typeId} truncated`);
      books.set(typeId, summarizeStationBook(items, scope === 'region' ? null : locationId));
    }).catch((error) => {
      failed = true;
      throw error;
    });
  } catch {
    failed = true;
    return null;
  }
  return books;
}

/** Older than this, a close is no longer "yesterday's" and is not offered as a price. */
export const R2_MAX_AGE_DAYS = 3;

/**
 * Yesterday's close at a hub station, or null for a non-hub station, no object
 * at all, or a series whose last day is older than `R2_MAX_AGE_DAYS` (the daily
 * job stopped, and the label would lie).
 */
async function r2Prices(
  stationId: number,
  typeIds: readonly number[],
  nowMs: number
): Promise<Map<number, HubAggregate> | null> {
  if (!TRADE_HUBS.some((h) => h.stationId === stationId)) return null;
  // Imported on demand so the R2 reader loads only when a fallback needs it.
  const { loadStoredOpenPrices } = await import('@/features/market/marketOpenPrices');
  const prices = new Map<number, HubAggregate>();
  let answered = false;
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (typeId) => {
    const stored = await loadStoredOpenPrices(typeId);
    const series = stored?.stations.get(stationId);
    let last = series ? series.dates.length - 1 : -1;
    const lastDay = series?.dates[last];
    if (lastDay && nowMs - Date.parse(`${lastDay}T00:00:00Z`) > R2_MAX_AGE_DAYS * DAY_MS) {
      last = -1;
    }
    const sellMin = last >= 0 ? (series?.sell[last] ?? null) : null;
    const buyMax = last >= 0 ? (series?.buy[last] ?? null) : null;
    if (last >= 0) answered = true;
    prices.set(typeId, { sellMin, buyMax, sellVolume: 0, buyVolume: 0 });
  });
  return answered ? prices : null;
}

/**
 * `fetchAggregates` with the fallback chain behind it. Rejects only when no
 * source answered at all; a batch every source agrees is empty resolves empty.
 */
export async function fetchAggregatesWithFallback(
  locationId: number,
  typeIds: number[],
  scope: AggregateScope = 'station',
  now: () => number = Date.now
): Promise<FallbackPrices> {
  if (typeIds.length === 0) return { prices: new Map(), stale: new Set() };
  let emptyAnswer: Map<number, HubAggregate> | null = null;
  if (fuzzworkAvailable(now())) {
    try {
      const prices = await fetchAggregates(locationId, typeIds, scope);
      if (!noPrices(prices)) return { prices, stale: new Set() };
      emptyAnswer = prices;
    } catch {
      markFuzzworkDown(now());
    }
  }

  const books = await esiBooks(locationId, typeIds, scope);
  if (books) {
    const prices = new Map<number, HubAggregate>();
    for (const typeId of typeIds) {
      const b = books.get(typeId);
      prices.set(typeId, {
        sellMin: b?.sellMin ?? null,
        buyMax: b?.buyMax ?? null,
        sellVolume: b?.sellVolume ?? 0,
        buyVolume: b?.buyVolume ?? 0,
      });
    }
    return { prices, stale: new Set() };
  }

  if (scope === 'station') {
    const prices = await r2Prices(locationId, typeIds, now());
    if (prices) return { prices, stale: new Set(prices.keys()) };
  }

  if (emptyAnswer) return { prices: emptyAnswer, stale: new Set() };
  throw new Error('no price source answered');
}

/**
 * `fetchOrderCounts` with an ESI step behind it (R2 holds no counts). Rejects
 * when neither source answered.
 */
export async function fetchOrderCountsWithFallback(
  stationId: number,
  typeIds: number[],
  now: () => number = Date.now
): Promise<Map<number, HubOrderCounts>> {
  if (typeIds.length === 0) return new Map();
  let emptyAnswer: Map<number, HubOrderCounts> | null = null;
  if (fuzzworkAvailable(now())) {
    try {
      const counts = await fetchOrderCounts(stationId, typeIds);
      if (!noCounts(counts)) return counts;
      emptyAnswer = counts;
    } catch {
      markFuzzworkDown(now());
    }
  }
  const books = await esiBooks(stationId, typeIds, 'station');
  if (books) {
    return new Map(
      typeIds.map((typeId) => {
        const b = books.get(typeId);
        return [
          typeId,
          {
            buyOrders: b?.buyOrders ?? 0,
            sellOrders: b?.sellOrders ?? 0,
            buyVolume: b?.buyVolume ?? 0,
            sellVolume: b?.sellVolume ?? 0,
          },
        ] as const;
      })
    );
  }
  if (emptyAnswer) return emptyAnswer;
  throw new Error('no order-count source answered');
}
