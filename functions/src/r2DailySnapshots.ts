import { gzipSync } from 'node:zlib';
import { isPlainRecord } from './guards.js';
import { openPricesR2Key, openPricesShardR2Key } from './openPricesKeys.js';
import type { R2Get, R2Put } from './r2Client.js';
import type { LpStoreRow } from './lpOffersSnapshot.js';
import type { StoredDemand } from './marketHistoryVolume.js';
import type {
  StoredTypeOpenPrices,
  TypeDay,
  TypeDays,
  TypeOpenPrices,
} from './marketOpenPrices.js';

export {
  OPEN_PRICES_R2_PREFIX,
  OPEN_PRICES_SHARD_COUNT,
  openPricesR2Key,
  openPricesShardR2Key,
} from './openPricesKeys.js';

export const LP_STORE_OFFERS_R2_KEY = 'lp-store-offers/snapshot.json';
export const LP_STORE_VOLUME_R2_PREFIX = 'lp-store-volume/';
export const HAULING_DEMAND_R2_PREFIX = 'hauling-demand/';

const LP_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=300',
};
const OPEN_PRICES_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=3600',
};
const OPEN_PRICES_CONCURRENCY = 32;

export async function readOpenPricesFromR2(get: R2Get, typeId: number): Promise<unknown | null> {
  const shard = await get(openPricesShardR2Key(typeId));
  const entry =
    isPlainRecord(shard) && isPlainRecord(shard.types) ? shard.types[String(typeId)] : undefined;
  return entry ?? get(openPricesR2Key(typeId));
}

export async function publishLpStoreOffersToR2(
  rows: readonly LpStoreRow[],
  lastSyncedAt: number,
  put: R2Put
): Promise<void> {
  await put(LP_STORE_OFFERS_R2_KEY, gzipSync(JSON.stringify({ lastSyncedAt, rows })), LP_HEADERS);
}

export function lpStoreVolumeR2Key(regionId: number): string {
  return `${LP_STORE_VOLUME_R2_PREFIX}${regionId}.json`;
}

export async function publishLpStoreVolumeToR2(
  regionId: number,
  volume: { lastSyncedAt: number; days: number; perDay: Record<number, number> },
  put: R2Put
): Promise<void> {
  await put(lpStoreVolumeR2Key(regionId), gzipSync(JSON.stringify(volume)), LP_HEADERS);
}

export function haulingDemandR2Key(regionId: number): string {
  return `${HAULING_DEMAND_R2_PREFIX}${regionId}.json`;
}

export async function publishHaulingDemandToR2(
  regionId: number,
  demand: {
    lastSyncedAt: number;
    asOf: string;
    days: number;
    types: Record<number, StoredDemand>;
  },
  put: R2Put
): Promise<void> {
  await put(haulingDemandR2Key(regionId), gzipSync(JSON.stringify(demand)), LP_HEADERS);
}

export interface MergeFn {
  (
    base: { typeId: number },
    existing: StoredTypeOpenPrices | null,
    days: readonly TypeDay[]
  ): TypeOpenPrices;
}

export interface WriteOpenPricesResult {
  written: number;
  skipped: number;
  failed: number;
  firstError: string | null;
}

async function readShardTypes(get: R2Get, key: string): Promise<Record<string, unknown>> {
  const shard = await get(key);
  if (shard === null) return {};
  if (!isPlainRecord(shard) || !isPlainRecord(shard.types))
    throw new Error(`${key}: not an open-prices shard`);
  return shard.types;
}

export async function writeOpenPricesToR2(
  items: Iterable<TypeDays>,
  merge: MergeFn,
  io: { get: R2Get; put: R2Put },
  onProgress?: (written: number) => void
): Promise<WriteOpenPricesResult> {
  const byShard = new Map<string, TypeDays[]>();
  for (const item of items) {
    const key = openPricesShardR2Key(item.typeId);
    const list = byShard.get(key);
    if (list) list.push(item);
    else byShard.set(key, [item]);
  }
  const shards = [...byShard];
  let next = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | null = null;
  const worker = async () => {
    while (next < shards.length) {
      const [key, shardItems] = shards[next++];
      try {
        const types = await readShardTypes(io.get, key);
        const merged: Record<string, unknown> = { ...types };
        for (const item of shardItems) {
          const id = String(item.typeId);
          const existing = (types[id] ??
            (await io.get(openPricesR2Key(item.typeId)))) as StoredTypeOpenPrices | null;
          merged[id] = merge(item, existing, item.days);
        }
        const body = JSON.stringify({ types: merged });
        if (JSON.stringify({ types }) === body) {
          skipped += 1;
        } else {
          await io.put(key, gzipSync(body), OPEN_PRICES_HEADERS);
          written += 1;
          onProgress?.(written);
        }
      } catch (error) {
        failed += 1;
        firstError ??= String(error);
      }
    }
  };
  await Promise.all(Array.from({ length: OPEN_PRICES_CONCURRENCY }, worker));
  return { written, skipped, failed, firstError };
}
