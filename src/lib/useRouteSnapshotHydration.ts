import { useEffect, useState } from 'react';
import { hydrateRouteSnapshots } from './routeSnapshotCache';

export function useRouteSnapshotHydration(ownerId: number | null, missing: boolean): void {
  const [, setHydrations] = useState(0);
  useEffect(() => {
    if (ownerId === null || !missing) return;
    let cancelled = false;
    void hydrateRouteSnapshots(ownerId).then(() => {
      if (!cancelled) setHydrations((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerId, missing]);
}
