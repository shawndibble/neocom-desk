import { useEffect, useState } from 'react';
import { hydrateRouteSnapshots } from './routeSnapshotCache';

/**
 * For a view that read no retained snapshot: load the owner's stored ones
 * (`routeSnapshotCache`) and re-render once they are in memory, so the first
 * visit after a reload shows the last snapshot instead of a spinner.
 */
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
