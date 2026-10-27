/**
 * Resolves a Build Plan's stored material price basis into the one price map
 * everything that buys a material on that plan reads — the plan's own cost
 * lines, its sub-build inputs, and the make-or-buy verdicts.
 *
 * Both maps come out of a single `loadMarketSnapshot` call (one Fuzzwork
 * aggregate carries `sellMin` and `buyMax` together), so switching basis is
 * pure re-computation: it must never key a refetch or a loading state.
 *
 * Materials only — the product is deliberately not routed through here.
 */
import type { HubPrices, MaterialPriceBasis } from '@/engine/industry/types';
import type { MarketSnapshot } from './marketData';

/** A stored value narrowed to a basis; anything unrecognised reads as 'sell'. */
export function materialPriceBasisOf(stored: string | undefined): MaterialPriceBasis {
  return stored === 'buy' ? 'buy' : 'sell';
}

/**
 * The prices to buy materials at. Null snapshot yields an empty map, which is
 * the same "nothing is priced yet" every caller already handles.
 */
export function materialPricesFor(
  snapshot: Pick<MarketSnapshot, 'hubPrices' | 'hubBuyPrices'> | null,
  basis: MaterialPriceBasis | undefined
): HubPrices {
  if (!snapshot) return {};
  return materialPriceBasisOf(basis) === 'buy' ? snapshot.hubBuyPrices : snapshot.hubPrices;
}
