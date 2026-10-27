/**
 * Raw `esiCache` row IO for callers doing their own batch or partial
 * resolution, plus the meta-vs-row freshness judgement shared with the loaders
 * in `cache.ts`. Re-exported from `cache.ts`, so import from there.
 */
import { db, type EsiCacheMetaRecord, type EsiCacheRecord } from '@/db';
import { isCachePurgePending } from './cachePurge';
import type { CachedResult } from './cache';

/**
 * Whether meta speaks for this value row: written with it (same `fetchedAt`),
 * or moved forward since by a 304 that named the row's own ETag.
 */
export function metaVouchesFor(
  meta: EsiCacheMetaRecord,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): boolean {
  if (meta.fetchedAt === row.fetchedAt) return true;
  return row.etag !== undefined && meta.etag === row.etag && meta.fetchedAt > row.fetchedAt;
}

/**
 * When a stored value was last confirmed current: a 304 moves meta's
 * `fetchedAt` forward without rewriting the value, so every reader that
 * reports a row's age — not just the loaders — takes the later of the two
 * while meta vouches for the row.
 */
export function effectiveFetchedAt(
  meta: EsiCacheMetaRecord | undefined,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): number {
  return meta !== undefined && metaVouchesFor(meta, row)
    ? Math.max(meta.fetchedAt, row.fetchedAt)
    : row.fetchedAt;
}

/** The raw stored row for the non-loader readers below; purge-gated like every read. */
async function readCachedRow(
  characterId: number,
  key: string
): Promise<EsiCacheRecord | undefined> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCache.get([characterId, key]);
}

/**
 * Same gate as `readCachedRow`, for one key across many characters. Lives
 * here so the D1 purge check has exactly one implementation — a caller doing
 * its own `bulkGet` would bypass it and serve a previous owner's rows.
 *
 * Returns a map so an absent character is distinguishable from one whose
 * cached value is itself empty. The purge check runs *after* the read: a
 * purge that becomes pending mid-batch still suppresses the row.
 */
export async function readCachedRows<T>(
  characterIds: readonly number[],
  key: string
): Promise<Map<number, CachedResult<T>>> {
  const found = new Map<number, CachedResult<T>>();
  if (characterIds.length === 0) return found;

  const ids = characterIds.map((id): [number, string] => [id, key]);
  const [rows, metas] = await Promise.all([db.esiCache.bulkGet(ids), db.esiCacheMeta.bulkGet(ids)]);
  const suppressed = await Promise.all(characterIds.map((id) => isCachePurgePending(id)));

  rows.forEach((row, i) => {
    if (!row || suppressed[i]) return;
    found.set(characterIds[i], {
      data: row.value as T,
      fetchedAt: new Date(effectiveFetchedAt(metas[i], row)),
      fromCache: true,
      truncated: row.truncated === true,
    });
  });
  return found;
}

/**
 * Many keys for one character, with each row's `fetchedAt`. One purge check
 * and one `bulkGet` rather than a read per key: `resolveNames` asks for a name
 * per distinct entity on a page, which is hundreds on an asset list.
 */
export async function readCachedEntries<T>(
  characterId: number,
  keys: readonly string[]
): Promise<Map<string, { value: T; fetchedAt: number }>> {
  const found = new Map<string, { value: T; fetchedAt: number }>();
  if (keys.length === 0) return found;
  if (await isCachePurgePending(characterId)) return found;

  const ids = keys.map((key): [number, string] => [characterId, key]);
  const [rows, metas] = await Promise.all([db.esiCache.bulkGet(ids), db.esiCacheMeta.bulkGet(ids)]);
  rows.forEach((row, i) => {
    if (!row) return;
    found.set(keys[i], { value: row.value as T, fetchedAt: effectiveFetchedAt(metas[i], row) });
  });
  return found;
}

/** Raw cache read, for callers doing their own batch/partial-resolution (names.ts, typeNames.ts). */
export async function readCached<T>(characterId: number, key: string): Promise<T | undefined> {
  const row = await readCachedRow(characterId, key);
  return row?.value as T | undefined;
}

/** Raw cache write; `fetchedAt` is a parameter so a caller stamping a whole batch uses one timestamp. */
export async function writeCached<T>(
  characterId: number,
  key: string,
  value: T,
  fetchedAt: number
): Promise<void> {
  await db.esiCache.put({ characterId, key, value, fetchedAt });
}

/**
 * `writeCached` for a batch: one `bulkPut` (one IndexedDB transaction) rather
 * than a transaction per row awaited in turn. Same row shape as `writeCached`,
 * so the two are interchangeable to every reader.
 */
export async function writeCachedMany(
  characterId: number,
  rows: ReadonlyArray<readonly [key: string, value: unknown]>,
  fetchedAt: number
): Promise<void> {
  if (rows.length === 0) return;
  await db.esiCache.bulkPut(rows.map(([key, value]) => ({ characterId, key, value, fetchedAt })));
}
