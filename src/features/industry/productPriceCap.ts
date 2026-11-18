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

/**
 * The snapshot with the plan's own sale price standing in for the product's
 * hub price (a nullsec market, a contract). The pilot's number is not a troll
 * price, so the product's average is dropped and `productSalePrice` cannot cap
 * it. A blank or unusable price leaves the snapshot alone.
 */
export function applyProductSalePrice<S extends MarketSnapshot | null>(
  snapshot: S,
  productTypeID: number | null | undefined,
  price: number | undefined
): S {
  if (!snapshot || productTypeID == null || price === undefined) return snapshot;
  if (!Number.isFinite(price) || price <= 0) return snapshot;
  const averagePrices = snapshot.averagePrices && { ...snapshot.averagePrices };
  if (averagePrices) delete averagePrices[productTypeID];
  return {
    ...snapshot,
    hubPrices: { ...snapshot.hubPrices, [productTypeID]: price },
    averagePrices,
  };
}
