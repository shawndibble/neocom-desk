import { cappedSellPrice } from '@/engine/industry/marketWideSanity';
import type { MarketSnapshot } from './marketData';

/**
 * The snapshot with the product's hub sell price capped at CCP's average when
 * the hub's cheapest order is a troll price (`cappedSellPrice`, the rule
 * Market-Wide uses). Ranked rows and the Build Plan they open both read the
 * product through this, so they agree. Materials are untouched; with no
 * average (or no product price) the snapshot comes back as is.
 */
export function capProductPrice<S extends MarketSnapshot | null>(
  snapshot: S,
  productTypeID: number | null | undefined
): { snapshot: S; capped: boolean } {
  const sellMin = productTypeID == null ? undefined : snapshot?.hubPrices[productTypeID];
  if (!snapshot || productTypeID == null || sellMin === undefined) {
    return { snapshot, capped: false };
  }
  const { price, capped } = cappedSellPrice(sellMin, snapshot.averagePrices?.[productTypeID]);
  if (!capped) return { snapshot, capped };
  return {
    snapshot: { ...snapshot, hubPrices: { ...snapshot.hubPrices, [productTypeID]: price } },
    capped,
  };
}
