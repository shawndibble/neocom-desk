/**
 * Session-lived store of the last snapshot each view loaded, keyed by
 * Character and then by view.
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
 * just "what this view rendered last time", and a reload rightly starts empty.
 *
 * The same shape as `stores/characterSp.ts` and `stores/publicInfo.ts` —
 * session-only cross-view caches — but keyed generically so one entry per view
 * costs no per-view module.
 */
import { onCachePurged } from '@/esi/cachePurge';

/**
 * Character id → view name → that view's last snapshot.
 *
 * Nested rather than one flat `name:characterId` key so a purge is an outer
 * `delete`, with no string parsing to get subtly wrong for one id that happens
 * to end with another.
 */
const byCharacter = new Map<number, Map<string, unknown>>();

export function readRouteSnapshot<T>(name: string, characterId: number): T | null {
  const found = byCharacter.get(characterId)?.get(name);
  return found === undefined ? null : (found as T);
}

export function writeRouteSnapshot<T>(name: string, characterId: number, data: T): void {
  let views = byCharacter.get(characterId);
  if (views === undefined) {
    views = new Map<string, unknown>();
    byCharacter.set(characterId, views);
  }
  views.set(name, data);
}

/**
 * Drop every view's retained snapshot for one Character.
 *
 * Blunt on purpose, exactly as `purgeCharacterCache` is: over-forgetting costs
 * one Dexie re-read, under-forgetting is a privacy bug. That matters most for
 * `purgeCorpScopedCache`, which deletes only the `corp:` rows — forgetting
 * just as bluntly there is what keeps a previous corporation's board, roster
 * and assets off the screen after a corp change.
 */
export function forgetRouteSnapshots(characterId: number): void {
  byCharacter.delete(characterId);
}

/** Every Character's, for the cache-wide `db.esiCache.clear()` fallback tier. */
export function forgetAllRouteSnapshots(): void {
  byCharacter.clear();
}

/** Test seam: module state otherwise outlives a `beforeEach` that only clears Dexie. */
export function resetRouteSnapshots(): void {
  byCharacter.clear();
}

onCachePurged((characterId) => {
  if (characterId === null) forgetAllRouteSnapshots();
  else forgetRouteSnapshots(characterId);
});
