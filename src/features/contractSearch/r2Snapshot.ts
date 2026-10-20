/**
 * The cache-through read shared by the R2-served public snapshots: the courier
 * snapshot here (issue #910) and the LP Store snapshot (`loyalty/`).
 *
 * Neither snapshot is per-character data, so both go through `esi/cache.ts`'s
 * `GLOBAL_CACHE_CHARACTER_ID` sentinel — the same trade every other
 * character-independent public lookup makes. R2 objects are public, so no
 * Firebase session is needed. Cache-through the way every ESI-backed view
 * loads (`fromCache` for the offline banner, a manual refresh re-fetches) even
 * though the live side is R2, not ESI — `loadWithCache` only needs a
 * `fetchLive`.
 */
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';

export interface R2Snapshot<TRow> {
  rows: TRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read it. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

/** Which snapshot to read, how, and under what key to cache it. */
export interface R2SnapshotSource<TRow> {
  /** Distinct per payload shape, never per consumer: two shapes under one key is a corrupt cache. */
  cacheKey: string;
  /**
   * Matched to how often the backend republishes, which is the soonest a
   * refetch can return anything new.
   *
   * A window this long also puts the entry out of a manual Refresh's reach:
   * `isRefreshInvalidated` deliberately only bypasses keys on the default
   * window, so a panel's Refresh re-runs the loader but reads the entry back
   * until the window lapses. That is the honest behaviour for a snapshot the
   * backend republishes on its own clock, and the UI names the snapshot's own
   * `lastSyncedAt`, so what is on screen still says how old it is.
   */
  staleAfterMs: number;
  /** The live read from R2. `null` means unavailable: there is no other source. */
  read: () => Promise<R2Snapshot<TRow> | null>;
}

/** How many R2 objects are in flight at once: enough to hide round-trip latency, few enough not to starve the page's other requests. */
export const CHUNK_READ_CONCURRENCY = 6;

/**
 * What one read of a snapshot yielded, and whether a newer one is still on its
 * way.
 *
 * `revalidating` is the visible half of `allowStaleServe`: the rows below
 * lapsed their window, so they are last cycle's and a live read is running
 * behind them. It is derived from the row's own `fetchedAt` rather than
 * reported by the cache, because that is the only thing that stays true across
 * the re-read the revalidation signal provokes — the flag clears by itself
 * when the fresher row lands.
 *
 * A read that *failed* is not reported here: it comes back as `fromCache` on
 * the cached result, which is the more alarming news and the one the view
 * should say instead.
 */
export interface R2SnapshotRead<TRow> {
  cached: CachedResult<R2Snapshot<TRow>> | null;
  revalidating: boolean;
}

export async function loadR2Snapshot<TRow>(
  source: R2SnapshotSource<TRow>
): Promise<R2SnapshotRead<TRow>> {
  const cached = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, source.cacheKey, source.read, {
    // A long window here is a publish cadence, not a claim that the payload is
    // a constant, so the lapsed row is the right thing to render while the
    // next read runs (issue #963). `fromCache` still reports a revalidation
    // that failed, so a refresh that never lands is stated rather than left
    // standing as "loading".
    staleAfterMs: source.staleAfterMs,
    allowStaleServe: true,
  });
  // `fetchedAt` alone, where `esi/cache.ts`'s own freshness test also honours a
  // stored `expiresAt`: that field comes from an ESI `Expires` header, which
  // nothing writes for these keys, so the two tests cannot disagree.
  const lapsed = cached !== null && cached.fetchedAt.getTime() + source.staleAfterMs <= Date.now();
  return { cached, revalidating: lapsed && !cached.fromCache };
}
