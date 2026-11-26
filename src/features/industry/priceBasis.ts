import { buyOrderMaterialPrices } from '@/engine/industry/buyOrderPrices';
import type { HubPrices, MaterialPriceBasis } from '@/engine/industry/types';
import type { MarketSnapshot } from './marketData';

export function materialPriceBasisOf(stored: string | undefined): MaterialPriceBasis {
  return stored === 'buy' ? 'buy' : 'sell';
}

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
