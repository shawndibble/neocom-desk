/**
 * Each product's latest price against its 90-day median, in its row's hub
 * region — the "vs 90d" column on both Build Opportunities tables. Results
 * land in batches, like `useDailySales`, so a few hundred rows don't
 * re-render the table a few hundred times.
 */
import { useEffect, useState } from 'react';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getTradeHub } from '@/market/hubs';
import { hubOrderKey, type HubOrderTarget } from './useHubOrderCounts';

const PUBLISH_EVERY = 25;

export interface PriceVsMedianState {
  /** Percent from the median by `hubOrderKey`; null where it couldn't be read. Absent until checked. */
  values: ReadonlyMap<string, number | null>;
}

const NONE: PriceVsMedianState = { values: new Map() };

export function usePriceVsMedian(targets: readonly HubOrderTarget[]): PriceVsMedianState {
  // Value-stable across renders that rebuild the same target list.
  const key = [...new Set(targets.map((target) => hubOrderKey(target.hubId, target.typeId)))]
    .sort()
    .join(',');
  const [state, setState] = useState<{ key: string; value: PriceVsMedianState }>({
    key: '',
    value: NONE,
  });

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const values = new Map<string, number | null>();
    const publish = () => {
      if (!cancelled) setState({ key, value: { values: new Map(values) } });
    };
    void mapWithConcurrencyLimit(key.split(','), ESI_FANOUT_CONCURRENCY, async (entry) => {
      const [hubId, typeId] = entry.split(':') as [string, string];
      const hub = getTradeHub(hubId);
      values.set(entry, hub ? await loadPriceVsMedian(hub.regionId, Number(typeId)) : null);
      if (values.size % PUBLISH_EVERY === 0) publish();
    }).then(publish);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state.key === key ? state.value : NONE;
}

/** A row's figure: undefined while still being read, null when blank. */
export function priceVsMedianFor(
  state: PriceVsMedianState,
  hubId: string,
  typeId: number | null
): number | null | undefined {
  return typeId === null ? null : state.values.get(hubOrderKey(hubId, typeId));
}
