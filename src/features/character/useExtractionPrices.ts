import { useEffect, useState } from 'react';
import {
  extractionNet,
  LARGE_SKILL_INJECTOR_TYPE_ID,
  SKILL_EXTRACTOR_TYPE_ID,
} from '@/engine/spExtraction';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';

export interface ExtractionPrices {
  hubName: string;
  /** False until the hub answers, so "loading" never reads as "no sell orders". */
  loaded: boolean;
  /** Null when either item has no sell orders at the saved hub. */
  net: number | null;
}

/** Net ISK per extraction at the saved market hub (sell injector − buy extractor). */
export function useExtractionPrices(): ExtractionPrices {
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const [state, setState] = useState<{ loaded: boolean; net: number | null }>({
    loaded: false,
    net: null,
  });
  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    void getHubPrices(hub, [LARGE_SKILL_INJECTOR_TYPE_ID, SKILL_EXTRACTOR_TYPE_ID])
      .then((prices) => ({
        loaded: true,
        net: extractionNet(
          prices.get(LARGE_SKILL_INJECTOR_TYPE_ID)?.sellMin ?? null,
          prices.get(SKILL_EXTRACTOR_TYPE_ID)?.sellMin ?? null
        ),
      }))
      .catch(() => ({ loaded: true, net: null }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated]);

  return { hubName: hub.systemName, loaded: state.loaded, net: state.net };
}
