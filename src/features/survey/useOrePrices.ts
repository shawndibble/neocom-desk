/**
 * ISK per unit for the ores a Survey shows, from the Survey's price hub
 * (the Mining page hub, `useHubFor('mining')`):
 * the highest buy order of the ore's Compressed form where it has one, as the
 * Moon Mining Tax ledger prices ore
 * (`features/miningTax/pricing.ts`). Works for a visitor with no session too:
 * the hub falls back to the default and Fuzzwork needs no login.
 */
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useHubFor } from '@/features/market/hub';
import { useSeededOnce } from '@/features/market/pageHubSeed';
import { migrateSurveyPriceHub } from './surveyPref';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { loadOrePrices } from './orePrices';

export interface OrePrices {
  /** Ore name as the scanner prints it -> ISK per unit; empty until loaded or when unreachable. */
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
      } catch {
        // Keep what was shown: a transient failure shouldn't blank the ISK figures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, key, hub, percent]);

  return useMemo(() => {
    // The last result stays up while a new ore or hub is fetched, so the ISK figures don't flicker.
    return {
      prices: loaded?.prices ?? new Map(),
      hub: (loaded && getTradeHub(loaded.hubId as TradeHub['id'])) || hub,
      compressed: loaded?.compressed ?? true,
    };
  }, [loaded, hub]);
}
