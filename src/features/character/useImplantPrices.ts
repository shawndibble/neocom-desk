import { useCallback, useMemo } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import type { PriceMap } from '@/features/character/CloneCard';

const EMPTY_PRICES: PriceMap = new Map();

export function useImplantPrices(typeIds: readonly number[]): PriceMap | undefined {
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useHydratedStore(useMarketHub);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceIds = useMemo(() => [...new Set(typeIds)].sort((a, b) => a - b), [typeIds]);
  const priceKey = `${hub.id}:${priceIds.join(',')}`;
  const load = useCallback(
    () =>
      Promise.all([getHubPrices(hub, priceIds), getRegionSellPrices(hub.regionId, priceIds)]).then(
        ([hubAgg, region]) => {
          const prices = new Map<number, number | null>();
          for (const id of priceIds)
            prices.set(id, hubAgg.get(id)?.sellMin ?? region.get(id) ?? null);
          return prices;
        }
      ),
    [hub, priceIds]
  );
  const { status, data } = useKeyedLoad(priceKey, load, !hubHydrated || priceIds.length === 0);
  return status === 'ready' ? data : status === 'failed' ? EMPTY_PRICES : undefined;
}
