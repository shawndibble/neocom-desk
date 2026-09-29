/**
 * Build Plan price lookups: Fuzzwork primary, per-type null fallback when
 * Fuzzwork is unreachable (ADR 0002).
 *
 * Two cache tiers, one TTL. Memory answers repeat asks within a session; the
 * generic `esiCache` table (under `GLOBAL_CACHE_CHARACTER_ID`) carries the
 * same entries across a reload, so reopening the app inside the TTL does not
 * refetch every price on screen. A persisted entry is served only while its
 * own TTL holds — never as a stale fallback — so the TTLs mean exactly what
 * they did when this cache was memory-only. Concurrent asks for the same
 * prices share one in-flight request rather than each missing and fetching.
 */
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import { fetchAggregates, type HubAggregate } from './fuzzwork';
import { fetchAdjustedPrices, type AdjustedPrice } from './esiPrices';
import type { TradeHub } from './hubs';

export type { HubAggregate, AdjustedPrice };

export const HUB_PRICE_TTL_MS = 15 * 60 * 1000;
export const ADJUSTED_PRICE_TTL_MS = 60 * 60 * 1000;

/** Injectable so tests can move time without waiting on it. Defaults to wall-clock. */
export type Clock = () => number;

const NULL_AGGREGATE: HubAggregate = Object.freeze({
  sellMin: null,
  buyMax: null,
  sellVolume: 0,
  buyVolume: 0,
});

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

const hubPriceCache = new Map<string, CacheEntry<HubAggregate>>();
const regionSellCache = new Map<string, CacheEntry<number | null>>();
let adjustedPriceCache: CacheEntry<Map<number, AdjustedPrice>> | null = null;

/**
 * Per (station, type) fetches in flight. Resolves to the aggregate, or `null`
 * when the fetch failed (the caller serves a null aggregate, nothing cached).
 */
const hubPricesInFlight = new Map<string, Promise<HubAggregate | null>>();
let adjustedPricesInFlight: Promise<Map<number, AdjustedPrice>> | null = null;

/**
 * Keys `invalidateHubPrices` dropped: their persisted rows are skipped until a
 * fetch replaces them, so a manual refresh cannot be answered from disk.
 */
const persistedBypass = new Set<string>();

/**
 * Bumped by `clearMarketPriceCache` and folded into every persisted key, so
 * the (synchronous, test-only) clear also retires rows already on disk.
 * Always 0 in production, which keeps the keys stable across reloads.
 *
 * Also what stops a fetch or disk read still in flight at a clear from
 * landing afterwards: each captures the generation it started under and
 * caches nothing if it has moved on.
 */
let persistedGeneration = 0;

function hubCacheKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}

function persistedKey(key: string): string {
  const base = `marketPrice:${key}`;
  return persistedGeneration === 0 ? base : `${base}#${persistedGeneration}`;
}

const ADJUSTED_KEY = 'adjusted';

/**
 * Writes behind a fetch without holding its caller: the memory tier already
 * has the value, and a failed write only costs the next reload a refetch.
 */
function persist(rows: ReadonlyArray<readonly [key: string, value: unknown]>, at: number): void {
  const keyed = rows.map(([key, value]) => [persistedKey(key), value] as const);
  void writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, keyed, at).catch(() => {});
}

/**
 * The persisted tier, where an unreadable one (IndexedDB unavailable, a
 * damaged store) is a miss rather than an error: these lookups never failed
 * on a cache before it existed, and must not start to now.
 */
async function readPersisted<V>(
  keys: readonly string[]
): Promise<Map<string, { value: V; fetchedAt: number }>> {
  try {
    return await readCachedEntries<V>(GLOBAL_CACHE_CHARACTER_ID, keys.map(persistedKey));
  } catch {
    return new Map();
  }
}

/** Test-only: production callers rely on TTL expiry instead of clearing. */
export function clearMarketPriceCache(): void {
  hubPriceCache.clear();
  regionSellCache.clear();
  adjustedPriceCache = null;
  hubPricesInFlight.clear();
  adjustedPricesInFlight = null;
  persistedBypass.clear();
  persistedGeneration += 1;
}

/**
 * Drops the cached prices for specific types at one station, so the next
 * `getHubPrices` re-fetches them inside the TTL.
 *
 * For the manual refresh button, which CONTEXT.md's "Data Age" makes the one
 * thing besides app open that may bypass a TTL. Scoped to a station and a
 * type list rather than clearing the map, for the same reason Market's
 * refresh re-fetches only what is on screen: a Build Plan holding prices for
 * the same materials should not be made to re-fetch them because someone
 * pressed refresh on a different page.
 */
export function invalidateHubPrices(stationId: number, typeIds: readonly number[]): void {
  for (const typeId of typeIds) {
    const key = hubCacheKey(stationId, typeId);
    hubPriceCache.delete(key);
    persistedBypass.add(key);
    // A request sent before the click is not an answer to it.
    hubPricesInFlight.delete(key);
  }
}

/**
 * Sell/buy aggregates for typeIds at one station, from cache where fresh.
 * Falls back to null prices per type (not a thrown error) when Fuzzwork is
 * unreachable. Station-keyed rather than hub-keyed (issue #1423) so a caller
 * that only ever has a bare `location_id` — the Foreground Poller's
 * `marketOrderUndercutDomain`, checking a Character's own order's station,
 * not one of the five Trade Hubs — can share this same 15-minute cache
 * without constructing a `TradeHub` object for it. `getHubPrices` below is
 * now a thin wrapper over this for the hub-shaped callers.
 */
export async function getStationPrices(
  stationId: number,
  typeIds: number[],
  now: Clock = Date.now
): Promise<Map<number, HubAggregate>> {
  const result = new Map<number, HubAggregate>();
  const nowMs = now();

  const readMemory = (typeId: number): boolean => {
    const cached = hubPriceCache.get(hubCacheKey(stationId, typeId));
    if (!cached || cached.expiresAt <= nowMs) return false;
    result.set(typeId, cached.value);
    return true;
  };

  const notInMemory = typeIds.filter((typeId) => !readMemory(typeId));
  if (notInMemory.length === 0) return result;

  // A reload inside the TTL: the rows the last session wrote.
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

  // Memory again — the disk read above, or a fetch that landed while it ran —
  // then join what is already in flight and fetch only the rest.
  const pending: Array<Promise<void>> = [];
  const toFetch: number[] = [];
  for (const typeId of notInMemory) {
    if (readMemory(typeId)) continue;
    const inFlight = hubPricesInFlight.get(hubCacheKey(stationId, typeId));
    if (inFlight) {
      pending.push(inFlight.then((value) => void result.set(typeId, value ?? NULL_AGGREGATE)));
    } else {
      toFetch.push(typeId);
    }
  }

  if (toFetch.length > 0) {
    const batch = fetchHubPrices(stationId, toFetch, nowMs);
    for (const typeId of toFetch) {
      const key = hubCacheKey(stationId, typeId);
      const perType = batch.then((fetched) =>
        fetched ? (fetched.get(typeId) ?? NULL_AGGREGATE) : null
      );
      hubPricesInFlight.set(key, perType);
      void perType.finally(() => {
        if (hubPricesInFlight.get(key) === perType) hubPricesInFlight.delete(key);
      });
      pending.push(perType.then((value) => void result.set(typeId, value ?? NULL_AGGREGATE)));
    }
  }

  await Promise.all(pending);
  return result;
}

/**
 * One Fuzzwork lookup, cached in both tiers on success. Never rejects: `null`
 * means Fuzzwork was unreachable, and then nothing is cached, so the next
 * refresh (open or manual button) retries instead of pinning "no price" for
 * the rest of the TTL.
 */
async function fetchHubPrices(
  stationId: number,
  typeIds: number[],
  nowMs: number
): Promise<Map<number, HubAggregate> | null> {
  const generation = persistedGeneration;
  let fetched: Map<number, HubAggregate>;
  try {
    // Chunked internally; a failure partway through discards earlier
    // batches too. Acceptable: the retry re-fetches everything, nothing gets
    // cached as a false "no price".
    fetched = await fetchAggregates(stationId, typeIds);
  } catch {
    return null;
  }
  if (generation !== persistedGeneration) return fetched;
  const rows: Array<readonly [string, HubAggregate]> = [];
  for (const typeId of typeIds) {
    const key = hubCacheKey(stationId, typeId);
    const value = fetched.get(typeId) ?? NULL_AGGREGATE;
    hubPriceCache.set(key, { value, expiresAt: nowMs + HUB_PRICE_TTL_MS });
    persistedBypass.delete(key);
    rows.push([key, value]);
  }
  persist(rows, nowMs);
  return fetched;
}

/**
 * Sell/buy aggregates for typeIds at hub, from cache where fresh. Falls back
 * to null prices per type (not a thrown error) when Fuzzwork is unreachable.
 */
export async function getHubPrices(
  hub: TradeHub,
  typeIds: number[],
  now: Clock = Date.now
): Promise<Map<number, HubAggregate>> {
  return getStationPrices(hub.stationId, typeIds, now);
}

/**
 * The lowest sell order for each of `typeIds` anywhere in one region, or
 * `null` — memory-cached on the hub TTL. For Blueprint Acquisition: an
 * NPC-seeded blueprint original is sold at its seeding corp's stations,
 * rarely at the hub station itself, so a hub-only price would miss it. A
 * failed fetch reads as no price for every type, never a thrown error.
 */
export async function getRegionSellPrices(
  regionId: number,
  typeIds: readonly number[],
  now: Clock = Date.now
): Promise<Map<number, number | null>> {
  const result = new Map<number, number | null>();
  const nowMs = now();
  const missing: number[] = [];
  for (const typeId of new Set(typeIds)) {
    const cached = regionSellCache.get(hubCacheKey(regionId, typeId));
    if (cached && cached.expiresAt > nowMs) result.set(typeId, cached.value);
    else missing.push(typeId);
  }
  if (missing.length === 0) return result;
  try {
    const fetched = await fetchAggregates(regionId, missing, 'region');
    for (const typeId of missing) {
      const sellMin = fetched.get(typeId)?.sellMin ?? null;
      regionSellCache.set(hubCacheKey(regionId, typeId), {
        value: sellMin,
        expiresAt: nowMs + HUB_PRICE_TTL_MS,
      });
      result.set(typeId, sellMin);
    }
  } catch {
    for (const typeId of missing) result.set(typeId, null);
  }
  return result;
}

/** Global adjusted/average prices (job-cost EIV), cached for an hour. */
export async function getAdjustedPrices(
  now: Clock = Date.now
): Promise<Map<number, AdjustedPrice>> {
  const nowMs = now();
  if (adjustedPriceCache && adjustedPriceCache.expiresAt > nowMs) {
    return adjustedPriceCache.value;
  }
  if (adjustedPricesInFlight) return adjustedPricesInFlight;
  const load = loadAdjustedPrices(nowMs);
  adjustedPricesInFlight = load;
  try {
    return await load;
  } finally {
    if (adjustedPricesInFlight === load) adjustedPricesInFlight = null;
  }
}

/**
 * Stored as `[typeId, adjusted, average]` tuples rather than the `Map`: the
 * payload covers every market type (tens of thousands), and flat number
 * triples are the cheapest shape to clone in and out of IndexedDB.
 */
type AdjustedPriceRow = Array<[typeId: number, adjusted: number | null, average: number | null]>;

async function loadAdjustedPrices(nowMs: number): Promise<Map<number, AdjustedPrice>> {
  const generation = persistedGeneration;
  const stored = await readPersisted<AdjustedPriceRow>([ADJUSTED_KEY]);
  const row = stored.get(persistedKey(ADJUSTED_KEY));
  if (generation === persistedGeneration && row && row.fetchedAt + ADJUSTED_PRICE_TTL_MS > nowMs) {
    const value = new Map<number, AdjustedPrice>();
    for (const [typeId, adjusted, average] of row.value) value.set(typeId, { adjusted, average });
    adjustedPriceCache = { value, expiresAt: row.fetchedAt + ADJUSTED_PRICE_TTL_MS };
    return value;
  }
  const value = await fetchAdjustedPrices();
  if (generation !== persistedGeneration) return value;
  adjustedPriceCache = { value, expiresAt: nowMs + ADJUSTED_PRICE_TTL_MS };
  const tuples: AdjustedPriceRow = [];
  for (const [typeId, price] of value) tuples.push([typeId, price.adjusted, price.average]);
  persist([[ADJUSTED_KEY, tuples]], nowMs);
  return value;
}
