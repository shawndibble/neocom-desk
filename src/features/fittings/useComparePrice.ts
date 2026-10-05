/**
 * Fit-wide sell/buy totals per compare slot, at the default Trade Hub —
 * the same figures `loadFittingPrice` gives the single-Fitting page,
 * reused here so "what this fit is worth" reads the same on both pages.
 * Riding `useCompareAsync` for its per-Fitting cache means a price never
 * refetches just because a different slot's Fitting changed.
 */
import type { FittingPriceTotals } from '@/engine/fittings/fittingCompare';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadFittingPrice } from './fittingPrice';
import { useCompareAsync, type CompareAsyncResult } from './useCompareAsync';

async function computeOne(fitting: Fitting, profile: PilotProfile): Promise<FittingPriceTotals> {
  const price = await loadFittingPrice(fitting, DEFAULT_TRADE_HUB, profile.implantTypeIds);
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
  return useCompareAsync(fittings, profile, computeOne);
}
