import { useCallback } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import {
  extractionNet,
  LARGE_SKILL_INJECTOR_TYPE_ID,
  SKILL_EXTRACTOR_TYPE_ID,
} from '@/engine/skills/spExtraction';
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
  const hubHydrated = useHydratedStore(useMarketHub);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const load = useCallback(
    () =>
      getHubPrices(hub, [LARGE_SKILL_INJECTOR_TYPE_ID, SKILL_EXTRACTOR_TYPE_ID])
        .then((prices) =>
          extractionNet(
            prices.get(LARGE_SKILL_INJECTOR_TYPE_ID)?.sellMin ?? null,
            prices.get(SKILL_EXTRACTOR_TYPE_ID)?.sellMin ?? null
          )
        )
        .catch(() => null),
    [hub]
  );
  const result = useKeyedLoad(hubHydrated ? hub.id : null, load);

  return { hubName: hub.systemName, loaded: result.status === 'ready', net: result.data ?? null };
}
