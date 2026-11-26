import { useEffect, useRef, useState } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';

export interface UseMarketSnapshotResult {
  snapshot: MarketSnapshot | null;
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
  refreshTick = 0,
  pricePercent?: number
): UseMarketSnapshotResult {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const key =
    typeIds.length === 0
      ? null
      : `${hub.id}:${costIndexSystemId ?? ''}:${activity}:${typeIds.join(',')}:${refreshTick}:${pricePercent ?? ''}`;

  const [lifecycle, setLifecycle] = useState<Lifecycle>({ key, loading: key !== null });
  if (lifecycle.key !== key) {
    setLifecycle({ key, loading: key !== null });
  }

  const paramsRef = useRef({ hub, typeIds, costIndexSystemId, activity, pricePercent });
  useEffect(() => {
    paramsRef.current = { hub, typeIds, costIndexSystemId, activity, pricePercent };
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const { hub, typeIds, costIndexSystemId, activity, pricePercent } = paramsRef.current;
    void loadMarketSnapshot(hub, [...typeIds], costIndexSystemId, activity, pricePercent).then(
      (snap) => {
        if (cancelled) return;
        setSnapshot(snap);
        setFetchedAt(new Date());
        setLifecycle({ key, loading: false });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { snapshot, fetchedAt, loading: lifecycle.loading };
}
