/**
 * A hook-sized value that starts from the last one loaded, instead of from
 * empty on every mount — `useRouteSnapshot`'s `cacheKey` for loaders that
 * aren't whole views (standings, account skills, owned stock).
 *
 * Opening a Build Plan from the Industry index used to reload each of these
 * from empty, and every one that landed re-rendered and re-priced the whole
 * plan although the index had just loaded the same data. Now the plan starts
 * from what the index had, and a value loaded within `WARM_LOAD_FRESH_MS`
 * isn't reloaded at all; an older one is, behind the warm start.
 *
 * Kept in `routeSnapshotCache.ts`, so a Character's values are forgotten with
 * its cache, and `ACCOUNT_SNAPSHOT_ID` values with any Character's.
 */
import { useEffect, useState } from 'react';
import { readRouteSnapshot, writeRouteSnapshot } from './routeSnapshotCache';

/** A load this recent is reused as is: page-to-page navigation, not a refresh. */
export const WARM_LOAD_FRESH_MS = 60_000;

interface Stamped<T> {
  value: T;
  loadedAt: number;
}

/**
 * @param name unique per value shape — two hooks sharing one would hand each
 * other the wrong data. Include anything the value depends on beyond `ownerId`.
 * @param ownerId the Character (or `ACCOUNT_SNAPSHOT_ID`) the value belongs
 * to; null loads nothing and returns `empty`.
 * @param load must close over nothing but its argument: the effect keys on
 * `name` and `ownerId` only. A rejection keeps what is showing.
 * @param empty returned before any load — pass a module constant so its
 * identity is stable.
 */
export function useWarmLoad<T>(
  name: string,
  ownerId: number | null,
  load: (ownerId: number) => Promise<T>,
  empty: T
): T {
  const [loaded, setLoaded] = useState<{ name: string; ownerId: number; value: T } | null>(null);

  useEffect(() => {
    if (ownerId === null) return;
    const cached = readRouteSnapshot<Stamped<T>>(name, ownerId);
    if (cached && Date.now() - cached.loadedAt < WARM_LOAD_FRESH_MS) return;
    let cancelled = false;
    load(ownerId).then(
      (value) => {
        writeRouteSnapshot<Stamped<T>>(name, ownerId, { value, loadedAt: Date.now() });
        if (!cancelled) setLoaded({ name, ownerId, value });
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` must close over nothing but its argument (see above); keying on it would reload every render for an inline arrow.
  }, [name, ownerId]);

  if (ownerId === null) return empty;
  if (loaded && loaded.name === name && loaded.ownerId === ownerId) return loaded.value;
  return readRouteSnapshot<Stamped<T>>(name, ownerId)?.value ?? empty;
}
