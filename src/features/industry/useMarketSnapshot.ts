/**
 * The React face of `loadMarketSnapshot` (marketData.ts): fetches one hub's
 * prices for a set of type ids, keyed on hub/system/activity/type-ids/a
 * manual-refresh tick, and re-fetches whenever that key changes.
 *
 * Two call sites (`BuildPlanDetail.tsx`, `useLoyaltyStoreOffers.ts`) used to
 * hand-roll this — state, an effect, a `cancelled` flag — independently, and
 * had already drifted: one reset its loading flag the instant the key
 * changed (render-phase, so no stale "ready" frame), the other didn't. This
 * hook owns that reset once, following the same "adjust state during render
 * on a changed key" idiom `useRouteSnapshot`/`useCorpSnapshot` use elsewhere
 * in the app.
 *
 * Deliberately stale-while-loading: `snapshot`/`fetchedAt` keep the previous
 * key's values across a refetch rather than clearing to null, so a hub
 * switch or manual refresh doesn't blank a view that was already showing
 * numbers — only `loading` flips. This matches what `BuildPlanDetail.tsx`
 * already did before extraction.
 */
import { useEffect, useRef, useState } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';

export interface UseMarketSnapshotResult {
  snapshot: MarketSnapshot | null;
  /** When `snapshot` was last resolved; null until the first load lands. */
  fetchedAt: Date | null;
  loading: boolean;
}

interface Lifecycle {
  key: string | null;
  loading: boolean;
}

export function useMarketSnapshot(
  hub: TradeHub,
  typeIds: readonly number[],
  costIndexSystemId?: number,
  activity: IndustryActivity = 'manufacturing',
  refreshTick = 0
): UseMarketSnapshotResult {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const key =
    typeIds.length === 0
      ? null
      : `${hub.id}:${costIndexSystemId ?? ''}:${activity}:${typeIds.join(',')}:${refreshTick}`;

  const [lifecycle, setLifecycle] = useState<Lifecycle>({ key, loading: key !== null });
  // Adjusting state during render, React's documented way to reset on a
  // changed key — an effect-only reset would show one frame of the previous
  // key's `loading: false` before the new fetch had a chance to start.
  if (lifecycle.key !== key) {
    setLifecycle({ key, loading: key !== null });
  }

  // Latest-ref so a caller passing freshly-computed `hub`/`typeIds` on every
  // render (neither is required to be memoized) can't restart the effect —
  // it re-fires on `key` alone, which is already value-stable.
  const paramsRef = useRef({ hub, typeIds, costIndexSystemId, activity });
  useEffect(() => {
    paramsRef.current = { hub, typeIds, costIndexSystemId, activity };
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const { hub, typeIds, costIndexSystemId, activity } = paramsRef.current;
    void loadMarketSnapshot(hub, [...typeIds], costIndexSystemId, activity).then((snap) => {
      if (cancelled) return;
      setSnapshot(snap);
      setFetchedAt(new Date());
      setLifecycle({ key, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { snapshot, fetchedAt, loading: lifecycle.loading };
}
