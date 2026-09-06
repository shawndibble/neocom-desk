import { describe, it, expect } from 'vitest';
import { materialPriceBasisOf, materialPricesFor } from '@/features/industry/priceBasis';

const snapshot = {
  hubPrices: { 34: 5 },
  hubBuyPrices: { 34: 4 },
};

describe('materialPriceBasisOf', () => {
  it('reads a stored buy basis', () => {
    expect(materialPriceBasisOf('buy')).toBe('buy');
  });

  it('falls back to sell for absent or unrecognised values', () => {
    expect(materialPriceBasisOf(undefined)).toBe('sell');
    expect(materialPriceBasisOf('sell')).toBe('sell');
    expect(materialPriceBasisOf('midpoint')).toBe('sell');
  });
});

describe('materialPricesFor', () => {
  it('returns the sell map by default', () => {
    expect(materialPricesFor(snapshot, undefined)).toBe(snapshot.hubPrices);
  });

  it('returns the buy map on a buy basis', () => {
    expect(materialPricesFor(snapshot, 'buy')).toBe(snapshot.hubBuyPrices);
  });

  it('yields an empty map before prices land', () => {
    expect(materialPricesFor(null, 'buy')).toEqual({});
  });
});
