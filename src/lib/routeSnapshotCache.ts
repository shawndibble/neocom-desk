/**
 * Session-lived store of the last snapshot each route loaded, keyed by route
 * and Character.
 *
 * `useRouteSnapshot` keeps its snapshot in `useState`, so it dies with the
 * component — and React Router unmounts a route on navigation. That made every
 * tab visit start from `null` with `loading` true, i.e. a spinner, even though
 * `esi/cache.ts` had the rows in Dexie the whole time. The app's promise is the
 * opposite (CLAUDE.md, `STALE_AFTER.default`): page-to-page navigation shows
 * what it already has and updates in place.
 *
 * In memory only, never Dexie: `esiCache` is already the durable copy, and a
 * second persisted copy would need its own purge and freshness rules. This is
 * just "what this tab rendered last time", and a reload rightly starts empty.
 *
 * The same shape as `stores/characterSp.ts` and `stores/publicInfo.ts` —
 * session-only cross-view caches — but keyed generically so one entry per route
 * costs no per-route module.
 */
import { onCachePurged } from '@/esi/cachePurge';

/** `${cacheKey}:${characterId}` → the last snapshot that route loaded for that Character. */
const snapshots = new Map<string, unknown>();

function storeKey(cacheKey: string, characterId: number): string {
  return `${cacheKey}:${characterId}`;
}

export function readRouteSnapshot<T>(cacheKey: string, characterId: number): T | null {
  const found = snapshots.get(storeKey(cacheKey, characterId));
  return found === undefined ? null : (found as T);
}

export function writeRouteSnapshot<T>(cacheKey: string, characterId: number, data: T): void {
  snapshots.set(storeKey(cacheKey, characterId), data);
}

/**
 * Drop every route's retained snapshot for one Character.
 *
 * Wired to the `esiCache` purge below, so the privacy rule has one trigger:
 * whatever revokes consent for the Dexie rows (scope removed, owner changed,
 * character removed) takes the in-memory copies of those same rows with it.
 * Without this a purge would leave the previous owner's wallet on screen until
 * a reload.
 */
export function forgetRouteSnapshots(characterId: number): void {
  const suffix = `:${characterId}`;
  for (const key of snapshots.keys()) {
    if (key.endsWith(suffix)) snapshots.delete(key);
  }
}

/** Test seam: module state otherwise outlives a `beforeEach` that only clears Dexie. */
export function resetRouteSnapshots(): void {
  snapshots.clear();
}

onCachePurged(forgetRouteSnapshots);
