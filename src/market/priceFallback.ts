import { getMarketOrders } from '@/esi/endpoints';
import { sum } from '@/engine/math';
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
import { registerTestReset } from '@/lib/testResets';

export const ESI_FALLBACK_MAX_TYPES = 50;

export const FUZZWORK_BACKOFF_MS = MINUTE_MS;

const ESI_STEP_CONCURRENCY = Math.min(4, ESI_FANOUT_CONCURRENCY);

export const R2_FALLBACK_MAX_TYPES = 200;

export interface FallbackPrices {
  prices: Map<number, HubAggregate>;
  stale: ReadonlySet<number>;
  fromSnapshot: boolean;
}

function liveAnswer(prices: Map<number, HubAggregate>): FallbackPrices {
  return { prices, stale: new Set(), fromSnapshot: false };
}

function snapshotAnswer(prices: Map<number, HubAggregate>): FallbackPrices {
  const stale = new Set<number>();
  for (const [typeId, p] of prices) if (p.sellMin !== null || p.buyMax !== null) stale.add(typeId);
  return { prices, stale, fromSnapshot: true };
}

let fuzzworkDownUntil = 0;

export function resetPriceFallback(): void {
  fuzzworkDownUntil = 0;
}
registerTestReset(resetPriceFallback);

function fuzzworkAvailable(nowMs: number): boolean {
  return nowMs >= fuzzworkDownUntil;
}

function markFuzzworkDown(nowMs: number): void {
  fuzzworkDownUntil = nowMs + FUZZWORK_BACKOFF_MS;
}

function noPrices(prices: ReadonlyMap<number, HubAggregate>): boolean {
  for (const a of prices.values()) if (a.sellMin !== null || a.buyMax !== null) return false;
  return true;
}

function noCounts(counts: ReadonlyMap<number, HubOrderCounts>): boolean {
  for (const c of counts.values()) if (c.buyOrders > 0 || c.sellOrders > 0) return false;
  return true;
}

async function regionOfStation(stationId: number): Promise<number | null> {
  const hub = TRADE_HUBS.find((h) => h.stationId === stationId);
  if (hub) return hub.regionId;
  const station = await lookupNpcStation(stationId).catch(() => undefined);
  if (!station) return null;
  const system = await lookupSolarSystem(station.systemId).catch(() => undefined);
  return system?.regionId ?? null;
}

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

function isTradeHub(stationId: number): boolean {
  return TRADE_HUBS.some((h) => h.stationId === stationId);
}

async function r2HubBookPrices(
  stationId: number,
  typeIds: readonly number[]
): Promise<Map<number, HubAggregate> | null> {
  if (!isTradeHub(stationId)) return null;
  const { loadHaulingBooks } = await import('@/features/market/haulingBooks');
  const books = await loadHaulingBooks(stationId);
  if (!books) return null;
  const prices = new Map<number, HubAggregate>();
  let answered = false;
  for (const typeId of typeIds) {
    const b = books.types.get(typeId);
    const sellMin = b?.sell[0]?.price ?? null;
    const buyMax = b?.buy[0]?.price ?? null;
    if (sellMin !== null || buyMax !== null) answered = true;
    prices.set(typeId, {
      sellMin,
      buyMax,
      sellVolume: b ? sum(b.sell.map((l) => l.units)) : 0,
      buyVolume: b ? sum(b.buy.map((l) => l.units)) : 0,
    });
  }
  return answered ? prices : null;
}

export const R2_MAX_AGE_DAYS = 3;

async function r2Prices(
  stationId: number,
  typeIds: readonly number[],
  nowMs: number
): Promise<Map<number, HubAggregate> | null> {
  if (!isTradeHub(stationId) || typeIds.length > R2_FALLBACK_MAX_TYPES) return null;
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

export async function fetchAggregatesWithFallback(
  locationId: number,
  typeIds: number[],
  scope: AggregateScope = 'station',
  now: () => number = Date.now
): Promise<FallbackPrices> {
  if (typeIds.length === 0) return liveAnswer(new Map());
  let emptyAnswer: Map<number, HubAggregate> | null = null;
  if (fuzzworkAvailable(now())) {
    try {
      const prices = await fetchAggregates(locationId, typeIds, scope);
      if (!noPrices(prices)) return liveAnswer(prices);
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
    return liveAnswer(prices);
  }

  if (scope === 'station') {
    const prices =
      (await r2HubBookPrices(locationId, typeIds)) ?? (await r2Prices(locationId, typeIds, now()));
    if (prices) return snapshotAnswer(prices);
  }

  if (emptyAnswer) return liveAnswer(emptyAnswer);
  throw new Error('no price source answered');
}

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
