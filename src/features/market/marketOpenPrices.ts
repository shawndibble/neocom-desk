/**
 * Daily open buy and sell prices for one item: the read half of the
 * `syncMarketOpenPrices` Cloud Function (docs/context/decisions/
 * 20261018-121126-price-history-draws-daily-open-buy-and-sell.md; layout:
 * 20261018-164126-open-prices-one-document-per-type-every-hub.md). One object per
 * type holding every Trade Hub station, a static file in Cloudflare R2 (20261018-201511-moving-the-daily-snapshots-to-r2.md), so — like the contract snapshots — this
 * needs no Firebase session and the read costs no egress.
 *
 * The prices are the hub *station*'s (Jita 4-4), keyed by station id.
 *
 * Never fails the history panel: a missing object (a type the daily job has
 * not reached), a region the object does not hold (any non-hub region) and an
 * offline client all come back as `null`, and the chart falls back to ESI's
 * average line. Only a good answer (including "no such object") is held, per
 * type, so the panel's primary and compared regions share one read and
 * reopening it costs none; a failure is retried the next time.
 */
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';
import { TRADE_HUBS } from '@/market/hubs';
import { isPlainRecord, isRecord } from '@/engine/guards';
import { HOUR_MS } from '@/lib/age';

/** Mirrors `openPricesR2Key` on the Functions side (`functions/src/r2DailySnapshots.ts`). */
export function openPricesUrl(typeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/open-prices/${typeId}.json`;
}

/**
 * Types share an object, `typeId % OPEN_PRICES_SHARD_COUNT`, so the daily job
 * writes a few thousand objects instead of one per type (each write is a billed
 * R2 operation). Mirrors the writer in `functions/src/r2DailySnapshots.ts`.
 */
export const OPEN_PRICES_SHARD_COUNT = 4096;

export function openPricesShardUrl(typeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/open-prices/shards/${typeId % OPEN_PRICES_SHARD_COUNT}.json`;
}

const READ_TIMEOUT_MS = 20_000;

/** The object at `url`, or `null` when R2 has none (404); any other failure throws. */
async function fetchObject(url: string): Promise<unknown | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/** The backend publishes once a day. */
const CACHE_TTL_MS = HOUR_MS;

/** A type's object as series, by hub station id. */
export interface StoredOpenPrices {
  stations: ReadonlyMap<number, OpenPriceSeries>;
}

/** What a region draws: its hub station's series. */
export interface HubOpenPrices {
  series: OpenPriceSeries;
  stationId: number;
}

function isNumberOrNullArray(value: unknown): value is (number | null)[] {
  return Array.isArray(value) && value.every((v) => v === null || typeof v === 'number');
}

function seriesById(map: unknown, dates: string[]): Map<number, OpenPriceSeries> {
  const out = new Map<number, OpenPriceSeries>();
  if (!isRecord(map)) return out;
  for (const [key, series] of Object.entries(map)) {
    const id = Number(key);
    if (!Number.isInteger(id) || !isRecord(series)) continue;
    const { buy, sell } = series;
    if (!isNumberOrNullArray(buy) || !isNumberOrNullArray(sell)) continue;
    out.set(id, { dates, buy, sell });
  }
  return out;
}

/**
 * The stored type object as series, or null when it is not shaped like one.
 * Mirrors the writer's layout: a shared ascending `dates` array and
 * `stations.<stationId>.buy|sell` parallel to it. A malformed series is skipped.
 */
export function parseOpenPricesByType(data: unknown): StoredOpenPrices | null {
  if (!isRecord(data)) return null;
  const { dates, stations } = data;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (dates.length === 0 || !isRecord(stations)) return null;
  return { stations: seriesById(stations, dates) };
}

/** The region's series to draw out of a type's object, or null when it has none (any non-hub region). */
export function pickOpenPrices(stored: StoredOpenPrices, regionId: number): HubOpenPrices | null {
  const stationId = TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId;
  const series = stationId === undefined ? undefined : stored.stations.get(stationId);
  return series && stationId !== undefined ? { series, stationId } : null;
}

const cache = new Map<number, { at: number; stored: StoredOpenPrices | null }>();
/** One read per type even when several regions ask at once; resolves undefined on failure. */
const inflight = new Map<number, Promise<StoredOpenPrices | null | undefined>>();

/** A shard's `types` record, or `null` when R2 has no shard yet (the per-type layout). */
type ShardTypes = Record<string, unknown> | null;
const shardCache = new Map<number, { at: number; types: ShardTypes }>();
/** One read per shard however many of its types are asked at once; rejects on failure. */
const shardInflight = new Map<number, Promise<ShardTypes>>();

/** For tests: forget every cached document. */
export function resetMarketOpenPricesCache(): void {
  cache.clear();
  inflight.clear();
  shardCache.clear();
  shardInflight.clear();
}

function readShard(typeId: number, now: number): Promise<ShardTypes> {
  const shard = typeId % OPEN_PRICES_SHARD_COUNT;
  const hit = shardCache.get(shard);
  if (hit && now - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.types);
  let pending = shardInflight.get(shard);
  if (!pending) {
    const read = fetchObject(openPricesShardUrl(typeId))
      .then((body) => {
        if (body !== null && !(isPlainRecord(body) && isPlainRecord(body.types))) {
          throw new Error(`open prices shard ${shard}: bad shape`);
        }
        const types = body === null ? null : (body.types as Record<string, unknown>);
        shardCache.set(shard, { at: now, types });
        return types;
      })
      .finally(() => {
        if (shardInflight.get(shard) === read) shardInflight.delete(shard);
      });
    pending = read;
    shardInflight.set(shard, read);
  }
  return pending;
}

/**
 * The type's stored object: out of its shard, else the type's own object. That
 * fallback covers the time before the writer moved to shards, and a type with
 * no hub price since (the writer only moves a type into its shard when it
 * prices it, so its older history stays in the old object).
 */
async function fetchStored(typeId: number, now: number): Promise<StoredOpenPrices | null> {
  const entry = (await readShard(typeId, now))?.[String(typeId)];
  if (entry !== undefined) return parseOpenPricesByType(entry);
  const body = await fetchObject(openPricesUrl(typeId));
  return body === null ? null : parseOpenPricesByType(body);
}

function readType(typeId: number, now: number): Promise<StoredOpenPrices | null | undefined> {
  let pending = inflight.get(typeId);
  if (!pending) {
    // Started inside the chain, so a synchronous failure is a failed read too,
    // never a rejection.
    const read: Promise<StoredOpenPrices | null | undefined> = Promise.resolve()
      .then(() => fetchStored(typeId, now))
      .then((stored) => {
        cache.set(typeId, { at: now, stored });
        return stored;
      })
      .catch(() => undefined)
      .finally(() => {
        if (inflight.get(typeId) === read) inflight.delete(typeId);
      });
    pending = read;
    inflight.set(typeId, read);
  }
  return pending;
}

/** The item's open-price series for the region (its hub station's), or null for "none to draw". Never throws. */
export async function loadMarketOpenPrices(
  regionId: number,
  typeId: number,
  now: number = Date.now()
): Promise<HubOpenPrices | null> {
  const stored = await loadStoredOpenPrices(typeId, now);
  return stored ? pickOpenPrices(stored, regionId) : null;
}

/**
 * The type's whole stored object, or null when there is none or the read
 * failed. Never throws. The mining prices (`hubSnapshot.ts`) read it this way;
 * shares the cache with `loadMarketOpenPrices`.
 */
export async function loadStoredOpenPrices(
  typeId: number,
  now: number = Date.now()
): Promise<StoredOpenPrices | null> {
  const hit = cache.get(typeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.stored;
  return (await readType(typeId, now)) ?? null;
}
