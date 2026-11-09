import { describe, it, expect } from 'vitest';
import type { MarketSnapshot } from './marketData';
import { capProductPrice } from './productPriceCap';

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
