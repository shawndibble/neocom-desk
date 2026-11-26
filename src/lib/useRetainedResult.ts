import { useCallback } from 'react';
import {
  ACCOUNT_SNAPSHOT_ID,
  readRouteSnapshot,
  routeSnapshotEpoch,
  writeRouteSnapshot,
} from './routeSnapshotCache';
import { useRouteSnapshotHydration } from './useRouteSnapshotHydration';

interface Stored<T> {
  key: string;
  value: T;
}

export function useRetainedResult<T extends object>(name: string, key: string) {
  const read = useCallback((): Partial<T> | null => {
    const stored = readRouteSnapshot<Stored<Partial<T>>>(name, ACCOUNT_SNAPSHOT_ID);
    return stored?.key === key ? stored.value : null;
  }, [name, key]);
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
