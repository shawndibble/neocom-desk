/**
 * Fit-wide sell/buy totals per compare slot, at the Fittings hub —
 * the same figures `loadFittingPrice` gives the single-Fitting page,
 * reused here so "what this fit is worth" reads the same on both pages.
 * Riding `useCompareAsync` for its per-Fitting cache means a price never
 * refetches just because a different slot's Fitting changed.
 */
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
  /** The Fittings page's price percent. */
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

/**
 * Per compare slot: sell/buy totals, or `failed` when the hub's order book
 * couldn't be loaded. The profile's active-clone implants are left
 * out of the price (a Fitting's implant set already worn costs nothing
 * extra), matching the editor; the profile also keys the cache.
 */
export function useComparePrice(
  fittings: readonly (Fitting | null)[],
  profile: PilotProfile | null
): CompareAsyncResult<FittingPriceTotals> {
  const { hubId, hydrated } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');
  // The hub and percent are the cache's context: a change re-prices every slot. Nothing is priced until the hub is read.
  const context = useMemo<PriceContext>(
    () => ({ hub: getTradeHub(hubId) ?? DEFAULT_TRADE_HUB, percent }),
    [hubId, percent]
  );
  return useCompareAsync(fittings, hydrated ? profile : null, computeOne, context);
}
