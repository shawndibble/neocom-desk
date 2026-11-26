import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';
import { TRADE_HUBS } from '@/market/hubs';
import { isPlainRecord, isRecord } from '@/engine/guards';
import { HOUR_MS } from '@/lib/age';

export function openPricesUrl(typeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/open-prices/${typeId}.json`;
}

export const OPEN_PRICES_SHARD_COUNT = 4096;

export function openPricesShardUrl(typeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/open-prices/shards/${typeId % OPEN_PRICES_SHARD_COUNT}.json`;
}

const READ_TIMEOUT_MS = 20_000;

async function fetchObject(url: string): Promise<unknown | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

const CACHE_TTL_MS = HOUR_MS;

export interface StoredOpenPrices {
  stations: ReadonlyMap<number, OpenPriceSeries>;
}

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

export function parseOpenPricesByType(data: unknown): StoredOpenPrices | null {
  if (!isRecord(data)) return null;
  const { dates, stations } = data;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (dates.length === 0 || !isRecord(stations)) return null;
  return { stations: seriesById(stations, dates) };
}

export function pickOpenPrices(stored: StoredOpenPrices, regionId: number): HubOpenPrices | null {
  const stationId = TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId;
  const series = stationId === undefined ? undefined : stored.stations.get(stationId);
  return series && stationId !== undefined ? { series, stationId } : null;
}

const cache = new Map<number, { at: number; stored: StoredOpenPrices | null }>();
const inflight = new Map<number, Promise<StoredOpenPrices | null | undefined>>();

type ShardTypes = Record<string, unknown> | null;
const shardCache = new Map<number, { at: number; types: ShardTypes }>();
const shardInflight = new Map<number, Promise<ShardTypes>>();

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

async function fetchStored(typeId: number, now: number): Promise<StoredOpenPrices | null> {
  const entry = (await readShard(typeId, now))?.[String(typeId)];
  if (entry !== undefined) return parseOpenPricesByType(entry);
  const body = await fetchObject(openPricesUrl(typeId));
  return body === null ? null : parseOpenPricesByType(body);
}

function readType(typeId: number, now: number): Promise<StoredOpenPrices | null | undefined> {
  let pending = inflight.get(typeId);
  if (!pending) {
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

export async function loadMarketOpenPrices(
  regionId: number,
  typeId: number,
  now: number = Date.now()
): Promise<HubOpenPrices | null> {
  const stored = await loadStoredOpenPrices(typeId, now);
  return stored ? pickOpenPrices(stored, regionId) : null;
}

export async function loadStoredOpenPrices(
  typeId: number,
  now: number = Date.now()
): Promise<StoredOpenPrices | null> {
  const hit = cache.get(typeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.stored;
  return (await readType(typeId, now)) ?? null;
}
