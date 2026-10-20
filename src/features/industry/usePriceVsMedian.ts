/**
 * Each product's latest price against its 90-day median, in its row's hub
 * region — the "vs 90d" column on both Build Opportunities tables. Results
 * land in batches, like `useDailySales`, so a few hundred rows don't
 * re-render the table a few hundred times.
 */
import { useMemo } from 'react';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { getTradeHub } from '@/market/hubs';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { hubOrderKey, type HubOrderTarget } from './useHubOrderCounts';

export interface PriceVsMedianState {
  /** Percent from the median by `hubOrderKey`; null where it couldn't be read. Absent until checked. */
  values: ReadonlyMap<string, number | null>;
}

async function readPriceVsMedian(entry: string): Promise<number | null> {
  const [hubId, typeId] = entry.split(':') as [string, string];
  const hub = getTradeHub(hubId);
  return hub ? await loadPriceVsMedian(hub.regionId, Number(typeId)) : null;
}

export function usePriceVsMedian(targets: readonly HubOrderTarget[]): PriceVsMedianState {
  // Value-stable across renders that rebuild the same target list.
  const key = [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
    .sort()
    .join(',');
  const { values } = useBatchedMap(key, readPriceVsMedian);
  return useMemo(() => ({ values }), [values]);
}

/** A row's figure: undefined while still being read, null when blank. */
export function priceVsMedianFor(
  state: PriceVsMedianState,
  hubId: string,
  typeId: number | null
): number | null | undefined {
  return typeId === null ? null : state.values.get(hubOrderKey(hubId, typeId));
}
