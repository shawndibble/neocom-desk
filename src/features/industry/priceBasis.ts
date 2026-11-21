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
 *
 * On Buy order each price carries the broker fee for placing the order
 * (`buyOrderMaterialPrices`, issue #6167), so every reader of the one map
 * pays it alike.
 */
import { buyOrderMaterialPrices } from '@/engine/industry/buyOrderPrices';
import type { HubPrices, MaterialPriceBasis } from '@/engine/industry/types';
import type { MarketSnapshot } from './marketData';
import { atPercent } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';

/** `prices` at `percent` of market (`atPercent`), for the Industry percent (issue #6531): the snapshot's hub maps and order-book depth. */
export function hubPricesAtPercent(prices: HubPrices, percent: number): HubPrices {
  if (percent === DEFAULT_PRICE_PERCENT) return prices;
  const scaled: HubPrices = {};
  for (const [typeId, price] of Object.entries(prices)) {
    scaled[Number(typeId)] = atPercent(price, percent);
  }
  return scaled;
}

/** A stored value narrowed to a basis; anything unrecognised reads as 'sell'. */
export function materialPriceBasisOf(stored: string | undefined): MaterialPriceBasis {
  return stored === 'buy' ? 'buy' : 'sell';
}

/**
 * Fee-added buy-order maps, per buy-price map and fee rate. Opportunities
 * resolve one plan per candidate against the same snapshot, so without this
 * each candidate copied the whole price map. Keyed weakly on the snapshot's
 * own map, so a new snapshot drops the old entries with it.
 */
const buyOrderPriceCache = new WeakMap<HubPrices, Map<number, HubPrices>>();

function cachedBuyOrderPrices(buyPrices: HubPrices, feePct: number): HubPrices {
  let byFee = buyOrderPriceCache.get(buyPrices);
  if (!byFee) {
    byFee = new Map();
    buyOrderPriceCache.set(buyPrices, byFee);
  }
  let prices = byFee.get(feePct);
  if (!prices) {
    prices = buyOrderMaterialPrices(buyPrices, feePct);
    byFee.set(feePct, prices);
  }
  return prices;
}

/**
 * The prices to buy materials at. Null snapshot yields an empty map, which is
 * the same "nothing is priced yet" every caller already handles.
 * `feePct` is the plan Character's rate for placing an order at the hub
 * (the engine's `buyOrderFeePct`); Buy now never reads it.
 */
export function materialPricesFor(
  snapshot: Pick<MarketSnapshot, 'hubPrices' | 'hubBuyPrices'> | null,
  basis: MaterialPriceBasis | undefined,
  feePct = 0
): HubPrices {
  if (!snapshot) return {};
  return materialPriceBasisOf(basis) === 'buy'
    ? cachedBuyOrderPrices(snapshot.hubBuyPrices, feePct)
    : snapshot.hubPrices;
}
