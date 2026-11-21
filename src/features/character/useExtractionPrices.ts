import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import {
  extractionNet,
  LARGE_SKILL_INJECTOR_TYPE_ID,
  SKILL_EXTRACTOR_TYPE_ID,
} from '@/engine/skills/spExtraction';
import { useHubFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { usePricePercentFor } from '@/features/market/pagePricePercents';

export interface ExtractionPrices {
  hubName: string;
  /** False until the hub answers, so "loading" never reads as "no sell orders". */
  loaded: boolean;
  /** Null when either item has no sell orders at the saved hub. */
  net: number | null;
}

/** Net ISK per extraction at the saved market hub (sell injector − buy extractor). */
export function useExtractionPrices(): ExtractionPrices {
  const { hubId, hydrated: hubHydrated } = useHubFor('skills');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  // The Skills page's price percent, on both the injector and the extractor.
  const percent = usePricePercentFor('skills');

  const load = useCallback(
    () =>
      getHubPricesAt(hub, [LARGE_SKILL_INJECTOR_TYPE_ID, SKILL_EXTRACTOR_TYPE_ID], percent)
        .then((prices) =>
          extractionNet(
            prices.get(LARGE_SKILL_INJECTOR_TYPE_ID)?.sellMin ?? null,
            prices.get(SKILL_EXTRACTOR_TYPE_ID)?.sellMin ?? null
          )
        )
        .catch(() => null),
    [hub, percent]
  );
  const result = useKeyedLoad(hubHydrated ? `${hub.id}:${percent}` : null, load);

  return { hubName: hub.systemName, loaded: result.status === 'ready', net: result.data ?? null };
}
