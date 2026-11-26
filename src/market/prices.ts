import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import {
  emitCacheRevalidated,
  GLOBAL_CACHE_CHARACTER_ID,
  readCachedEntries,
  writeCachedMany,
} from '@/esi/cache';
import type { HubAggregate } from './fuzzwork';
import { fetchAggregatesWithFallback, resetPriceFallback } from './priceFallback';
import { fetchAdjustedPrices, type AdjustedPrice } from './esiPrices';
import { registerTestReset } from '@/lib/testResets';
import type { TradeHub } from './hubs';

export type { HubAggregate, AdjustedPrice };

export const HUB_PRICE_TTL_MS = 15 * MINUTE_MS;
export const ADJUSTED_PRICE_TTL_MS = HOUR_MS;

export type Clock = () => number;

const NULL_AGGREGATE: HubAggregate = Object.freeze({
  sellMin: null,
  buyMax: null,
  sellVolume: 0,
  buyVolume: 0,
});

interface PricedAggregate {
  value: HubAggregate;
  stale: boolean;
  snapshot: boolean;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

const hubPriceCache = new Map<string, CacheEntry<HubAggregate>>();
const regionSellCache = new Map<string, CacheEntry<number | null>>();
const regionSellInFlight = new Map<string, Promise<number | null>>();
let adjustedPriceCache: CacheEntry<Map<number, AdjustedPrice>> | null = null;

const hubPricesInFlight = new Map<string, Promise<PricedAggregate | null>>();
let adjustedPricesInFlight: Promise<Map<number, AdjustedPrice>> | null = null;
let adjustedStaleServed: Map<number, AdjustedPrice> | null = null;

const persistedBypass = new Set<string>();

let persistedGeneration = 0;

function hubCacheKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}

function persistedKey(key: string): string {
  const base = `marketPrice:${key}`;
  return persistedGeneration === 0 ? base : `${base}#${persistedGeneration}`;
}

const ADJUSTED_KEY = 'adjusted';

function persist(rows: ReadonlyArray<readonly [key: string, value: unknown]>, at: number): void {
  const keyed = rows.map(([key, value]) => [persistedKey(key), value] as const);
  void writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, keyed, at).catch(() => {});
}

async function readPersisted<V>(
  keys: readonly string[]
): Promise<Map<string, { value: V; fetchedAt: number }>> {
  try {
    return await readCachedEntries<V>(GLOBAL_CACHE_CHARACTER_ID, keys.map(persistedKey));
  } catch {
    return new Map();
  }
}

export function clearMarketPriceCache(): void {
  hubPriceCache.clear();
  regionSellCache.clear();
  regionSellInFlight.clear();
  adjustedPriceCache = null;
  hubPricesInFlight.clear();
  resetPriceFallback();
  adjustedPricesInFlight = null;
  adjustedStaleServed = null;
  persistedBypass.clear();
  persistedGeneration += 1;
}
registerTestReset(clearMarketPriceCache);

export function invalidateHubPrices(stationId: number, typeIds: readonly number[]): void {
  for (const typeId of typeIds) {
    const key = hubCacheKey(stationId, typeId);
    hubPriceCache.delete(key);
    persistedBypass.add(key);
    hubPricesInFlight.delete(key);
  }
}

export async function getStationPrices(
  stationId: number,
  typeIds: number[],
  now: Clock = Date.now,
  options: PriceOptions = {}
): Promise<Map<number, HubAggregate>> {
  return (await getStationPricesWithStatus(stationId, typeIds, now, options)).prices;
}

export interface PriceOptions {
  allowStale?: boolean;
}

export interface PricesWithStatus {
  prices: Map<number, HubAggregate>;
  unreachable: boolean;
  stale: boolean;
}

export async function getStationPricesWithStatus(
  stationId: number,
  typeIds: number[],
  now: Clock = Date.now,
  { allowStale = true }: PriceOptions = {}
): Promise<PricesWithStatus> {
  const result = new Map<number, HubAggregate>();
  let unreachable = false;
  let stale = false;
  const nowMs = now();

  const take = (typeId: number, priced: PricedAggregate | null): void => {
    if (!priced || (priced.snapshot && !allowStale)) {
      unreachable = true;
      result.set(typeId, NULL_AGGREGATE);
      return;
    }
    if (priced.stale) stale = true;
    result.set(typeId, priced.value);
  };

  const readMemory = (typeId: number): boolean => {
    const cached = hubPriceCache.get(hubCacheKey(stationId, typeId));
    if (!cached || cached.expiresAt <= nowMs) return false;
    result.set(typeId, cached.value);
    return true;
  };

  const notInMemory = typeIds.filter((typeId) => !readMemory(typeId));
  if (notInMemory.length === 0) return { prices: result, unreachable, stale };

  const generation = persistedGeneration;
  const onDisk = notInMemory
    .map((typeId) => hubCacheKey(stationId, typeId))
    .filter((key) => !persistedBypass.has(key) && !hubPricesInFlight.has(key));
  const rows = await readPersisted<HubAggregate>(onDisk);
  for (const key of generation === persistedGeneration ? onDisk : []) {
    const row = rows.get(persistedKey(key));
    if (row && row.fetchedAt + HUB_PRICE_TTL_MS > nowMs) {
      hubPriceCache.set(key, { value: row.value, expiresAt: row.fetchedAt + HUB_PRICE_TTL_MS });
    }
  }

  const pending: Array<Promise<void>> = [];
  const toFetch: number[] = [];
  for (const typeId of notInMemory) {
    if (readMemory(typeId)) continue;
    const inFlight = hubPricesInFlight.get(hubCacheKey(stationId, typeId));
    if (inFlight) {
      pending.push(inFlight.then((priced) => take(typeId, priced)));
    } else {
      toFetch.push(typeId);
    }
  }

  if (toFetch.length > 0) {
    const batch = fetchHubPrices(stationId, toFetch, nowMs);
    for (const typeId of toFetch) {
      const key = hubCacheKey(stationId, typeId);
      const perType = batch.then((fetched) =>
        fetched
          ? (fetched.get(typeId) ?? { value: NULL_AGGREGATE, stale: false, snapshot: false })
          : null
      );
      hubPricesInFlight.set(key, perType);
      void perType.finally(() => {
        if (hubPricesInFlight.get(key) === perType) hubPricesInFlight.delete(key);
      });
      pending.push(perType.then((priced) => take(typeId, priced)));
    }
  }

  await Promise.all(pending);
  return { prices: result, unreachable, stale };
}

async function fetchHubPrices(
  stationId: number,
  typeIds: number[],
  nowMs: number
): Promise<Map<number, PricedAggregate> | null> {
  const generation = persistedGeneration;
  let fetched: Awaited<ReturnType<typeof fetchAggregatesWithFallback>>;
  try {
    fetched = await fetchAggregatesWithFallback(stationId, typeIds);
  } catch {
    return null;
  }
  const priced = new Map<number, PricedAggregate>();
  for (const typeId of typeIds) {
    priced.set(typeId, {
      value: fetched.prices.get(typeId) ?? NULL_AGGREGATE,
      stale: fetched.stale.has(typeId),
      snapshot: fetched.fromSnapshot,
    });
  }
  if (generation !== persistedGeneration || fetched.fromSnapshot) return priced;
  const rows: Array<readonly [string, HubAggregate]> = [];
  for (const [typeId, { value }] of priced) {
    const key = hubCacheKey(stationId, typeId);
    hubPriceCache.set(key, { value, expiresAt: nowMs + HUB_PRICE_TTL_MS });
    persistedBypass.delete(key);
    rows.push([key, value]);
  }
  persist(rows, nowMs);
  return priced;
}

export async function getHubPrices(
  hub: TradeHub,
  typeIds: number[],
  now: Clock = Date.now,
  options: PriceOptions = {}
): Promise<Map<number, HubAggregate>> {
  return getStationPrices(hub.stationId, typeIds, now, options);
}

export async function getHubPricesWithStatus(
  hub: TradeHub,
  typeIds: number[],
  now: Clock = Date.now,
  options: PriceOptions = {}
): Promise<PricesWithStatus> {
  return getStationPricesWithStatus(hub.stationId, typeIds, now, options);
}

export async function getRegionSellPrices(
  regionId: number,
  typeIds: readonly number[],
  now: Clock = Date.now
): Promise<Map<number, number | null>> {
  const result = new Map<number, number | null>();
  const nowMs = now();
  const pending = new Map<number, Promise<number | null>>();
  const missing: number[] = [];
  for (const typeId of new Set(typeIds)) {
    const key = hubCacheKey(regionId, typeId);
    const cached = regionSellCache.get(key);
    const inFlight = regionSellInFlight.get(key);
    if (cached && cached.expiresAt > nowMs) result.set(typeId, cached.value);
    else if (inFlight) pending.set(typeId, inFlight);
    else missing.push(typeId);
  }
  if (missing.length > 0) {
    const fetch = fetchAggregatesWithFallback(regionId, missing, 'region').then(
      (fetched) => fetched.prices,
      () => null
    );
    for (const typeId of missing) {
      const key = hubCacheKey(regionId, typeId);
      const price = fetch.then((fetched) => {
        regionSellInFlight.delete(key);
        if (!fetched) return null;
        const sellMin = fetched.get(typeId)?.sellMin ?? null;
        regionSellCache.set(key, { value: sellMin, expiresAt: nowMs + HUB_PRICE_TTL_MS });
        return sellMin;
      });
      regionSellInFlight.set(key, price);
      pending.set(typeId, price);
    }
  }
  const settled = await Promise.all([...pending.values()]);
  [...pending.keys()].forEach((typeId, i) => result.set(typeId, settled[i]));
  return result;
}

export async function getAdjustedPrices(
  now: Clock = Date.now,
  options: { allowStale?: boolean } = {}
): Promise<Map<number, AdjustedPrice>> {
  const nowMs = now();
  if (adjustedPriceCache && adjustedPriceCache.expiresAt > nowMs) {
    return adjustedPriceCache.value;
  }
  if (adjustedPricesInFlight) {
    if (options.allowStale && adjustedStaleServed) return adjustedStaleServed;
    return adjustedPricesInFlight;
  }
  const load = loadAdjustedPrices(nowMs, options.allowStale === true);
  adjustedPricesInFlight = load;
  try {
    return await load;
  } finally {
    if (adjustedPricesInFlight === load) adjustedPricesInFlight = null;
  }
}

type AdjustedPriceRow = Array<[typeId: number, adjusted: number | null, average: number | null]>;

function rowsToMap(rows: AdjustedPriceRow): Map<number, AdjustedPrice> {
  const value = new Map<number, AdjustedPrice>();
  for (const [typeId, adjusted, average] of rows) value.set(typeId, { adjusted, average });
  return value;
}

function mapToRows(value: Map<number, AdjustedPrice>): AdjustedPriceRow {
  const rows: AdjustedPriceRow = [];
  for (const [typeId, price] of value) rows.push([typeId, price.adjusted, price.average]);
  return rows;
}

async function loadAdjustedPrices(
  nowMs: number,
  allowStale: boolean
): Promise<Map<number, AdjustedPrice>> {
  const generation = persistedGeneration;
  const stored = await readPersisted<AdjustedPriceRow>([ADJUSTED_KEY]);
  const row = stored.get(persistedKey(ADJUSTED_KEY));
  if (generation === persistedGeneration && row && row.fetchedAt + ADJUSTED_PRICE_TTL_MS > nowMs) {
    const value = rowsToMap(row.value);
    adjustedPriceCache = { value, expiresAt: row.fetchedAt + ADJUSTED_PRICE_TTL_MS };
    return value;
  }
  const fetchLive = async () => {
    const value = await fetchAdjustedPrices();
    if (generation !== persistedGeneration) return value;
    adjustedPriceCache = { value, expiresAt: nowMs + ADJUSTED_PRICE_TTL_MS };
    persist([[ADJUSTED_KEY, mapToRows(value)]], nowMs);
    return value;
  };
  if (allowStale && generation === persistedGeneration && row) {
    const stale = rowsToMap(row.value);
    adjustedStaleServed = stale;
    const refresh = fetchLive();
    adjustedPricesInFlight = refresh;
    void refresh
      .then(
        () => emitCacheRevalidated(),
        () => {}
      )
      .finally(() => {
        if (adjustedPricesInFlight === refresh) adjustedPricesInFlight = null;
        if (adjustedStaleServed === stale) adjustedStaleServed = null;
      });
    return stale;
  }
  return fetchLive();
}

export async function getAveragePriceByType(): Promise<Map<number, number>> {
  const byType = new Map<number, number>();
  try {
    const prices = await getAdjustedPrices(Date.now, { allowStale: true });
    for (const [typeId, price] of prices) {
      if (price.average !== null) byType.set(typeId, price.average);
    }
  } catch {
    byType.clear();
  }
  return byType;
}
