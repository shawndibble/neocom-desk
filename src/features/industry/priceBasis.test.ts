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

  it('returns the buy map on a buy basis at a zero fee', () => {
    expect(materialPricesFor(snapshot, 'buy')).toBe(snapshot.hubBuyPrices);
  });

  it('adds the buy-order placement fee on a buy basis', () => {
    expect(materialPricesFor(snapshot, 'buy', 1.5)[34]).toBeCloseTo(4.06);
  });

  it('reuses one fee-added map per snapshot and fee rate, not a copy per call', () => {
    const first = materialPricesFor(snapshot, 'buy', 1.5);
    expect(materialPricesFor(snapshot, 'buy', 1.5)).toBe(first);
    expect(materialPricesFor(snapshot, 'buy', 2)).not.toBe(first);
    expect(materialPricesFor({ ...snapshot, hubBuyPrices: { 34: 4 } }, 'buy', 1.5)).not.toBe(first);
  });

  it('leaves Buy now untouched whatever the fee', () => {
    expect(materialPricesFor(snapshot, 'sell', 1.5)).toBe(snapshot.hubPrices);
  });

  it('yields an empty map before prices land', () => {
    expect(materialPricesFor(null, 'buy')).toEqual({});
  });
});
