import { useCallback, useMemo } from 'react';
import { doctrineCoverage, doctrineParts, type HubCoverage } from '@/engine/doctrineCoverage';
import { loadBooks } from '@/features/industry/depthPriceLoader';
import { useHubFor } from '@/features/market/hub';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import type { DoctrineFit } from '../srpTypes';

export interface DoctrineCoverageState {
  hub: TradeHub;
  loading: boolean;
  /** A fit's coverage; null while loading, or when a part's book could not be read. */
  coverageOf: (fit: DoctrineFit) => HubCoverage | null;
}

/**
 * Hub coverage (#6387) of the Director's Doctrine Fits at the default Trade Hub: every part's
 * region Order Book (`getOrderBook`'s 300 s cache), walked per fit. Books are fetched once per
 * set of parts, not per fit. An outage leaves `coverageOf` null for the fits it touched.
 */
export function useDoctrineCoverage(fits: readonly DoctrineFit[]): DoctrineCoverageState {
  const { hubId, hydrated: hubHydrated } = useHubFor('corpSrp');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const typeKey = [...new Set(fits.flatMap((f) => [...doctrineParts(f.snapshot).keys()]))]
    .sort((a, b) => a - b)
    .join(',');
  const loader = useCallback(
    () => loadBooks(hub.regionId, typeKey === '' ? [] : typeKey.split(',').map(Number)),
    [hub.regionId, typeKey]
  );
  const load = useKeyedLoad(`${hub.id}:${typeKey}`, loader, !hubHydrated || typeKey === '');
  const books = load.data;
  const coverageOf = useMemo(
    () => (fit: DoctrineFit) =>
      books ? doctrineCoverage(fit.snapshot, books, hub.stationId) : null,
    [books, hub.stationId]
  );
  return { hub, loading: load.status === 'loading' || !hubHydrated, coverageOf };
}
