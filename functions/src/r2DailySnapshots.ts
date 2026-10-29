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
import type { R2Get, R2Put } from './r2Client.js';
import type { LpStoreRow } from './lpOffersSnapshot.js';
import type { StoredDemand } from './marketHistoryVolume.js';
import type {
  StoredTypeOpenPrices,
  TypeDay,
  TypeDays,
  TypeOpenPrices,
} from './marketOpenPrices.js';

export const LP_STORE_OFFERS_R2_KEY = 'lp-store-offers/snapshot.json';
export const OPEN_PRICES_R2_PREFIX = 'open-prices/';
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
/** Small objects dominated by round-trip latency, as in `r2Publisher.ts`. */
const OPEN_PRICES_CONCURRENCY = 32;

export function openPricesR2Key(typeId: number): string {
  return `${OPEN_PRICES_R2_PREFIX}${typeId}.json`;
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
  /** Objects actually put. */
  written: number;
  /** Objects left alone because the merge changed nothing (saves a Class A write). */
  skipped: number;
  failed: number;
  /** First failure's message, so an auth or network fault is diagnosable from the log. */
  firstError: string | null;
}

/**
 * Merges `items` into each type's R2 object (read, `merge`, write). `items` is
 * consumed lazily so the backfill's ~20k documents are never materialised at
 * once. A type that fails is counted, not thrown: the merge is idempotent, so
 * the caller retries the whole run. `onProgress` gets the running total of
 * written objects.
 */
export async function writeOpenPricesToR2(
  items: Iterable<TypeDays>,
  merge: MergeFn,
  io: { get: R2Get; put: R2Put },
  onProgress?: (written: number) => void
): Promise<WriteOpenPricesResult> {
  const iterator = items[Symbol.iterator]();
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | null = null;
  const worker = async () => {
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      const item = step.value;
      const key = openPricesR2Key(item.typeId);
      try {
        const existing = (await io.get(key)) as StoredTypeOpenPrices | null;
        const merged = merge(item, existing, item.days);
        // Key order follows the stored order when nothing changed, so a plain stringify compare is safe;
        // a reordered-but-equal object just costs one extra put.
        if (existing !== null && JSON.stringify(existing) === JSON.stringify(merged)) {
          skipped += 1;
        } else {
          await io.put(key, gzipSync(JSON.stringify(merged)), OPEN_PRICES_HEADERS);
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
