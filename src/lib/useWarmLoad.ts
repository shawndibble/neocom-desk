import { useEffect, useState } from 'react';
import { readRouteSnapshot, routeSnapshotEpoch, writeRouteSnapshot } from './routeSnapshotCache';
import { useRouteSnapshotHydration } from './useRouteSnapshotHydration';
import { MINUTE_MS } from '@/lib/age';

export const WARM_LOAD_FRESH_MS = MINUTE_MS;

interface Stamped<T> {
  value: T;
  loadedAt: number;
}

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
    const startedAt = routeSnapshotEpoch(ownerId);
    load(ownerId).then(
      (value) => {
        writeRouteSnapshot<Stamped<T>>(
          name,
          ownerId,
          { value, loadedAt: Date.now() },
          { startedAt }
        );
        if (!cancelled) setLoaded({ name, ownerId, value });
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` must close over nothing but its argument (see above); keying on it would reload every render for an inline arrow.
  }, [name, ownerId]);

  const current = loaded && loaded.name === name && loaded.ownerId === ownerId ? loaded : null;
  const retained = ownerId === null ? null : readRouteSnapshot<Stamped<T>>(name, ownerId);
  useRouteSnapshotHydration(ownerId, current === null && retained === null);

  if (ownerId === null) return empty;
  return current?.value ?? retained?.value ?? empty;
}
