import { cappedSellPrice } from '@/engine/industry/marketWideSanity';
import type { MarketSnapshot } from './marketData';

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
