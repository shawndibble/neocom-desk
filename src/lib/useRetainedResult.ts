import { useCallback } from 'react';
import {
  ACCOUNT_SNAPSHOT_ID,
  readRouteSnapshot,
  routeSnapshotEpoch,
  writeRouteSnapshot,
} from './routeSnapshotCache';
import { useRouteSnapshotHydration } from './useRouteSnapshotHydration';

interface Stored<T> {
  /** What the result was loaded for; a different one (a new roster) is not this result. */
  key: string;
  value: T;
}

/**
 * The last good result of a load that runs beside a view's snapshot (the Tax
 * tab's made payments and Corp Tax Books), kept in `routeSnapshotCache` so it
 * is on the first frame, after a reload and offline, exactly as the snapshot is.
 * Without it each such load starts empty on every mount and the page repaints as
 * each one arrives, the early frames showing a ledger the late ones correct.
 *
 * Kept under `ACCOUNT_SNAPSHOT_ID`: these span every tracked Character, so a purge of any one
 * (a corp change on an alt included) forgets them. `read` is for render and for a load's merge
 * step; it is `null` for another `key`. `startLoad` is called as a load begins and returns the function that
 * stores its result, so a purge that lands mid-load drops it. A save merges its
 * fields onto what is stored, for a result that arrives in parts.
 */
export function useRetainedResult<T extends object>(name: string, key: string) {
  const read = useCallback((): Partial<T> | null => {
    const stored = readRouteSnapshot<Stored<Partial<T>>>(name, ACCOUNT_SNAPSHOT_ID);
    return stored?.key === key ? stored.value : null;
  }, [name, key]);
  // First visit after a reload: the stored copy, once it is in memory.
  useRouteSnapshotHydration(ACCOUNT_SNAPSHOT_ID, read() === null);

  const startLoad = useCallback(() => {
    const startedAt = routeSnapshotEpoch(ACCOUNT_SNAPSHOT_ID);
    return (patch: Partial<T>) => {
      const value: Stored<Partial<T>> = { key, value: { ...read(), ...patch } };
      writeRouteSnapshot(name, ACCOUNT_SNAPSHOT_ID, value, { startedAt });
    };
  }, [name, key, read]);

  return { read, startLoad };
}
