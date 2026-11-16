import { cappedSellPrice } from '@/engine/industry/marketWideSanity';
import type { MarketSnapshot } from './marketData';

/**
 * The product's hub sell price, capped at CCP's average when the hub's
 * cheapest order is a troll price (`cappedSellPrice`, the rule Market-Wide
 * uses). Null with no snapshot, no product or no sell order.
 */
export function productSalePrice(
  snapshot: MarketSnapshot | null,
  productTypeID: number | null | undefined
): { price: number | null; capped: boolean } {
  const sellMin = productTypeID == null ? undefined : snapshot?.hubPrices[productTypeID];
  if (!snapshot || productTypeID == null || sellMin === undefined) {
    return { price: null, capped: false };
  }
  return cappedSellPrice(sellMin, snapshot.averagePrices?.[productTypeID]);
}

/**
 * The snapshot with the product's hub sell price at `productSalePrice`, for
 * the engine to price revenue off. Ranked rows and the Build Plan they open
 * both price the product through this, so they agree. Materials are
 * untouched; uncapped, the snapshot comes back as is.
 */
export function capProductPrice<S extends MarketSnapshot | null>(
  snapshot: S,
  productTypeID: number | null | undefined
): { snapshot: S; capped: boolean } {
  const { price, capped } = productSalePrice(snapshot, productTypeID);
  if (!capped || !snapshot || productTypeID == null || price === null) {
    return { snapshot, capped };
  }
  return {
    snapshot: { ...snapshot, hubPrices: { ...snapshot.hubPrices, [productTypeID]: price } },
    capped,
  };
}
