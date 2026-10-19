import { useEffect, useMemo, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import type { PriceMap } from '@/features/character/CloneCard';

/**
 * Implant values at the market hub: lowest sell there, else lowest in its
 * region. A progressive enhancement: the list shows before any price.
 * `undefined` while loading; a failed read yields an empty map (every implant
 * unpriced) rather than an endless wait.
 */
export function useImplantPrices(typeIds: readonly number[]): PriceMap | undefined {
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useHydratedStore(useMarketHub);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceIds = useMemo(() => [...new Set(typeIds)].sort((a, b) => a - b), [typeIds]);
  const priceKey = `${hub.id}:${priceIds.join(',')}`;
  const [priced, setPriced] = useState<{ key: string; prices: PriceMap } | null>(null);
  useEffect(() => {
    if (!hubHydrated || priceIds.length === 0) return;
    let cancelled = false;
    void Promise.all([getHubPrices(hub, priceIds), getRegionSellPrices(hub.regionId, priceIds)])
      .then(([hubAgg, region]) => {
        if (cancelled) return;
        const prices = new Map<number, number | null>();
        for (const id of priceIds)
          prices.set(id, hubAgg.get(id)?.sellMin ?? region.get(id) ?? null);
        setPriced({ key: priceKey, prices });
      })
      .catch(() => {
        // A failed read leaves every implant unpriced rather than an endless wait.
        if (!cancelled) setPriced({ key: priceKey, prices: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated, priceIds, priceKey]);
  return priced?.key === priceKey ? priced.prices : undefined;
}
