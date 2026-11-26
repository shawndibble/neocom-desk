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
  loaded: boolean;
  net: number | null;
}

export function useExtractionPrices(): ExtractionPrices {
  const { hubId, hydrated: hubHydrated } = useHubFor('skills');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
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
