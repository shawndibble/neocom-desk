/**
 * The daily public snapshots served from Cloudflare R2 instead of Firestore
 * (docs/context/decisions/20261018-201511-moving-the-daily-snapshots-to-r2.md, the
 * same trade as ADR 0019): the LP Store offers and the per-type open prices.
 * Both are public data the app reads whole and many times, which is what R2's
 * free egress is for. Fetch- and Firestore-free like `r2Publisher.ts`: the
 * reads and uploads are arguments.
 *
 * Unlike the contract snapshots these keys are mutable (a fixed name per
 * object, rewritten in place), so they carry a short `max-age` instead of
 * `immutable`, and an R2 lifecycle rule must not cover their prefixes.
 */
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

/** Rewritten once a day; five minutes keeps a fresh publish visible soon after. */
const LP_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=300',
};
/** One merge a day per type, so an hour of edge staleness is invisible on a daily chart. */
const OPEN_PRICES_HEADERS = {
  'Content-Type': 'application/json',
  'Content-Encoding': 'gzip',
  'Cache-Control': 'public, max-age=3600',
};
/** ~4,000 small shards, each a read and a write dominated by round-trip latency. */
const OPEN_PRICES_CONCURRENCY = 32;

/**
 * One type's open-prices object (unvalidated), or `null` when R2 has none: out
 * of its shard, else the type's own object (before shards existed, or a type not
 * priced since). The client reads the same way.
 */
export async function readOpenPricesFromR2(get: R2Get, typeId: number): Promise<unknown | null> {
  const shard = await get(openPricesShardR2Key(typeId));
  const entry =
    isPlainRecord(shard) && isPlainRecord(shard.types) ? shard.types[String(typeId)] : undefined;
  return entry ?? get(openPricesR2Key(typeId));
}

/** The LP snapshot as one object: `{ lastSyncedAt, rows }`, the shape the client reads back. */
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

/** One hub region's daily volume object: `{ lastSyncedAt, days, perDay }`, read back by the LP Store page. */
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

/**
 * One hub region's demand object (issue #5344): `{ lastSyncedAt, asOf, days, types }`,
 * where `types` maps a type id to its `StoredDemand` tuple. Read back by the hauling scan.
 */
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
  /** Shards actually put. */
  written: number;
  /** Shards left alone because the merge changed nothing (saves a Class A write). */
  skipped: number;
  failed: number;
  /** First failure's message, so an auth or network fault is diagnosable from the log. */
  firstError: string | null;
}

/** A shard's `types`, `{}` when R2 has no shard yet; throws on anything not shaped like a shard, so it is never overwritten. */
async function readShardTypes(get: R2Get, key: string): Promise<Record<string, unknown>> {
  const shard = await get(key);
  if (shard === null) return {};
  if (!isRecord(shard) || !isRecord(shard.types))
    throw new Error(`${key}: not an open-prices shard`);
  return shard.types;
}

/**
 * Merges `items` into their types' entries in the R2 shards (read the shard,
 * `merge` each of its types, write the shard once). A type its shard does not
 * hold yet is seeded from the type's own object, the layout before shards, so
 * its history carries over; a type not priced today stays as it was. A shard
 * that fails is counted, not thrown: the merge is idempotent, so the caller
 * retries the whole run. `onProgress` gets the running total of written shards.
 */
export async function writeOpenPricesToR2(
  items: Iterable<TypeDays>,
  merge: MergeFn,
  io: { get: R2Get; put: R2Put },
  onProgress?: (written: number) => void
): Promise<WriteOpenPricesResult> {
  // A day is ~20k small items; grouping them by shard holds them all at once, which is fine.
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
        // Merging keeps the stored key order when nothing changed, so a plain stringify compare is
        // safe; a reordered-but-equal shard just costs one extra put.
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
