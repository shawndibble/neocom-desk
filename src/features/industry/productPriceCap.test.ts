import { describe, it, expect } from 'vitest';
import type { MarketSnapshot } from './marketData';
import { applyProductSalePrice, capProductPrice, productSalePrice } from './productPriceCap';

describe('capProductPrice', () => {
  const snapshot = (averagePrices: MarketSnapshot['averagePrices']): MarketSnapshot =>
    ({
      hubPrices: { 1: 100_000, 2: 100_000 },
      averagePrices,
    }) as unknown as MarketSnapshot;

  it('caps only the product, at the average, and says so', () => {
    const { snapshot: capped, capped: wasCapped } = capProductPrice(
      snapshot({ 1: 100, 2: 100 }),
      1
    );
    expect(wasCapped).toBe(true);
    expect(capped.hubPrices).toEqual({ 1: 100, 2: 100_000 });
  });

  it('leaves the snapshot alone below the ratio', () => {
    const s = snapshot({ 1: 90_000 });
    expect(capProductPrice(s, 1)).toEqual({ snapshot: s, capped: false });
  });

  it('does not cap with no average, or when the averages failed to load', () => {
    for (const averages of [{}, null, undefined]) {
      const s = snapshot(averages);
      expect(capProductPrice(s, 1)).toEqual({ snapshot: s, capped: false });
    }
  });

  it('passes a missing snapshot or product through', () => {
    expect(capProductPrice(null, 1)).toEqual({ snapshot: null, capped: false });
    const s = snapshot({ 1: 100 });
    expect(capProductPrice(s, null)).toEqual({ snapshot: s, capped: false });
  });
});

describe('applyProductSalePrice', () => {
  const snap = {
    hubPrices: { 1: 100_000, 2: 5 },
    averagePrices: { 1: 100, 2: 5 },
  } as unknown as MarketSnapshot;

  it('replaces only the product price and lifts the troll cap for it', () => {
    const out = applyProductSalePrice(snap, 1, 90_000);
    expect(out?.hubPrices).toEqual({ 1: 90_000, 2: 5 });
    expect(productSalePrice(out, 1)).toEqual({ price: 90_000, capped: false });
  });

  it('prices a product the hub has no order for', () => {
    const out = applyProductSalePrice({ hubPrices: {} } as unknown as MarketSnapshot, 1, 7);
    expect(productSalePrice(out, 1)).toEqual({ price: 7, capped: false });
  });

  it('ignores a blank, zero, negative or non-finite price', () => {
    for (const bad of [undefined, 0, -1, Number.NaN]) {
      expect(applyProductSalePrice(snap, 1, bad)).toBe(snap);
    }
    expect(applyProductSalePrice(null, 1, 5)).toBeNull();
    expect(applyProductSalePrice(snap, null, 5)).toBe(snap);
  });
});
