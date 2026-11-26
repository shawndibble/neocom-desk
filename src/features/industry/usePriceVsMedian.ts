import { useMemo } from 'react';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { getTradeHub } from '@/market/hubs';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { hubOrderKey, type HubOrderTarget } from './useHubOrderCounts';

export interface PriceVsMedianState {
  values: ReadonlyMap<string, number | null>;
}

async function readPriceVsMedian(entry: string): Promise<number | null> {
  const [hubId, typeId] = entry.split(':') as [string, string];
  const hub = getTradeHub(hubId);
  return hub ? await loadPriceVsMedian(hub.regionId, Number(typeId)) : null;
}

export function usePriceVsMedian(targets: readonly HubOrderTarget[]): PriceVsMedianState {
  const key = [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
    .sort()
    .join(',');
  const { values } = useBatchedMap(key, readPriceVsMedian);
  return useMemo(() => ({ values }), [values]);
}

export function priceVsMedianFor(
  state: PriceVsMedianState,
  hubId: string,
  typeId: number | null
): number | null | undefined {
  return typeId === null ? null : state.values.get(hubOrderKey(hubId, typeId));
}
