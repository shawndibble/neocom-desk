import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';

export interface R2Snapshot<TRow> {
  rows: TRow[];
  lastSyncedAt: number | null;
}

export interface R2SnapshotSource<TRow> {
  cacheKey: string;
  staleAfterMs: number;
  read: () => Promise<R2Snapshot<TRow> | null>;
}

export const CHUNK_READ_CONCURRENCY = 24;

export interface R2SnapshotRead<TRow> {
  cached: CachedResult<R2Snapshot<TRow>> | null;
  revalidating: boolean;
}

export async function loadR2Snapshot<TRow>(
  source: R2SnapshotSource<TRow>
): Promise<R2SnapshotRead<TRow>> {
  const cached = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, source.cacheKey, source.read, {
    staleAfterMs: source.staleAfterMs,
    allowStaleServe: true,
  });
  const lapsed = cached !== null && cached.fetchedAt.getTime() + source.staleAfterMs <= Date.now();
  return { cached, revalidating: lapsed && !cached.fromCache };
}
