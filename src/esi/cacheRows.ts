import { db, type EsiCacheMetaRecord, type EsiCacheRecord } from '@/db';
import { isCachePurgePending } from './cachePurge';
import type { CachedResult } from './cache';

export function metaVouchesFor(
  meta: EsiCacheMetaRecord,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): boolean {
  if (meta.fetchedAt === row.fetchedAt) return true;
  return row.etag !== undefined && meta.etag === row.etag && meta.fetchedAt > row.fetchedAt;
}

export function effectiveFetchedAt(
  meta: EsiCacheMetaRecord | undefined,
  row: Pick<EsiCacheRecord, 'fetchedAt' | 'etag'>
): number {
  return meta !== undefined && metaVouchesFor(meta, row)
    ? Math.max(meta.fetchedAt, row.fetchedAt)
    : row.fetchedAt;
}

async function readCachedRow(
  characterId: number,
  key: string
): Promise<EsiCacheRecord | undefined> {
  if (await isCachePurgePending(characterId)) return undefined;
  return db.esiCache.get([characterId, key]);
}

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

export async function readCached<T>(characterId: number, key: string): Promise<T | undefined> {
  const row = await readCachedRow(characterId, key);
  return row?.value as T | undefined;
}

export async function writeCached<T>(
  characterId: number,
  key: string,
  value: T,
  fetchedAt: number
): Promise<void> {
  await db.esiCache.put({ characterId, key, value, fetchedAt });
}

export async function writeCachedMany(
  characterId: number,
  rows: ReadonlyArray<readonly [key: string, value: unknown]>,
  fetchedAt: number
): Promise<void> {
  if (rows.length === 0) return;
  await db.esiCache.bulkPut(rows.map(([key, value]) => ({ characterId, key, value, fetchedAt })));
}
