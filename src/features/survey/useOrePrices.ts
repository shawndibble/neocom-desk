import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useHubFor } from '@/features/market/hub';
import { useSeededOnce } from '@/features/market/pageHubSeed';
import { migrateSurveyPriceHub } from './surveyPref';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { loadOrePrices } from './orePrices';

export interface OrePrices {
  prices: ReadonlyMap<string, number>;
  hub: TradeHub;
  compressed: boolean;
}

export function useOrePrices(oreNames: readonly string[]): OrePrices {
  const seeded = useSeededOnce(migrateSurveyPriceHub);
  const { hubId, hydrated: hubHydrated } = useHubFor('mining');
  const hydrated = seeded && hubHydrated;
  const hub = (hydrated ? getTradeHub(hubId) : undefined) ?? DEFAULT_TRADE_HUB;
  const percent = usePricePercentFor('mining');
  const key = [...new Set(oreNames)].sort().join('\n');
  const [loaded, setLoaded] = useState<{
    key: string;
    hubId: string;
    prices: ReadonlyMap<string, number>;
    compressed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!hydrated || key === '') return;
    let cancelled = false;
    void (async () => {
      try {
        const { prices, compressed } = await loadOrePrices(key.split('\n'), hub, percent);
        if (!cancelled) setLoaded({ key, hubId: hub.id, prices, compressed });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, key, hub, percent]);

  return useMemo(() => {
    return {
      prices: loaded?.prices ?? new Map(),
      hub: (loaded && getTradeHub(loaded.hubId as TradeHub['id'])) || hub,
      compressed: loaded?.compressed ?? true,
    };
  }, [loaded, hub]);
}
