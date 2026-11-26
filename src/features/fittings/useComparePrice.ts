import { useMemo } from 'react';
import type { FittingPriceTotals } from '@/engine/fittings/fittingCompare';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadFittingPrice } from './fittingPrice';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

interface PriceContext {
  hub: TradeHub;
  percent: number;
}

async function computeOne(
  fitting: Fitting,
  profile: PilotProfile,
  context?: unknown
): Promise<FittingPriceTotals> {
  const { hub, percent } = (context as PriceContext | undefined) ?? {
    hub: DEFAULT_TRADE_HUB,
    percent: 100,
  };
  const price = await loadFittingPrice(fitting, hub, profile.implantTypeIds, percent);
  return { sell: price.totals.sell, buy: price.totals.buy };
}

export function useComparePrice(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingPriceTotals> {
  const { hubId, hydrated } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');
  const context = useMemo<PriceContext>(
    () => ({ hub: getTradeHub(hubId) ?? DEFAULT_TRADE_HUB, percent }),
    [hubId, percent]
  );
  return useCompareAsync(fittings, hydrated ? profile : null, computeOne, context);
}
