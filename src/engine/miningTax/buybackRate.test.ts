import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUYBACK_RATE,
  isValidBuybackRate,
  MAX_BUYBACK_RATE,
  MIN_BUYBACK_RATE,
  scaleUnitPrices,
  scaleValuation,
} from './buybackRate';
import type { EntryValuation } from './yieldValuation';

function valuation(overrides: Partial<EntryValuation> = {}): EntryValuation {
  return {
    rawValue: 1000,
    refineValue: 800,
    pricedAll: true,
    efficiency: 0.5,
    implantBonusPct: 0,
    lines: [
      {
        typeId: 1,
        quantity: 100,
        rawValue: 600,
        refineValue: 500,
        refineOutputs: [],
        batches: 1,
        unitsLeftOver: 0,
      },
      {
        typeId: 2,
        quantity: 50,
        rawValue: 400,
        refineValue: 300,
        refineOutputs: [],
        batches: 1,
        unitsLeftOver: 0,
      },
    ],
    ...overrides,
  };
}

describe('isValidBuybackRate', () => {
  it('accepts the full 0-100 range', () => {
    expect(isValidBuybackRate(0)).toBe(true);
    expect(isValidBuybackRate(90)).toBe(true);
    expect(isValidBuybackRate(100)).toBe(true);
  });

  it('rejects values outside 0-100', () => {
    expect(isValidBuybackRate(-1)).toBe(false);
    expect(isValidBuybackRate(101)).toBe(false);
    expect(isValidBuybackRate(Number.NaN)).toBe(false);
    expect(isValidBuybackRate(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('exposes its bounds and default', () => {
    expect(MIN_BUYBACK_RATE).toBe(0);
    expect(MAX_BUYBACK_RATE).toBe(100);
    expect(DEFAULT_BUYBACK_RATE).toBe(100);
  });
});

describe('scaleValuation', () => {
  it('is the identity at 100%', () => {
    const original = valuation();
    expect(scaleValuation(original, 100)).toEqual(original);
  });

  it('scales raw and refine value, including every line, at 90%', () => {
    const scaled = scaleValuation(valuation(), 90);
    expect(scaled.rawValue).toBeCloseTo(900);
    expect(scaled.refineValue).toBeCloseTo(720);
    expect(scaled.lines[0].rawValue).toBeCloseTo(540);
    expect(scaled.lines[0].refineValue).toBeCloseTo(450);
    expect(scaled.lines[1].rawValue).toBeCloseTo(360);
    expect(scaled.lines[1].refineValue).toBeCloseTo(270);
  });

  it('zeroes every value at 0%', () => {
    const scaled = scaleValuation(valuation(), 0);
    expect(scaled.rawValue).toBe(0);
    expect(scaled.refineValue).toBe(0);
    expect(scaled.lines[0].rawValue).toBe(0);
    expect(scaled.lines[0].refineValue).toBe(0);
    expect(scaled.lines[1].rawValue).toBe(0);
    expect(scaled.lines[1].refineValue).toBe(0);
  });

  it('leaves pricing metadata, quantities and refine outputs untouched', () => {
    const original = valuation();
    const scaled = scaleValuation(original, 90);
    expect(scaled.pricedAll).toBe(original.pricedAll);
    expect(scaled.efficiency).toBe(original.efficiency);
    expect(scaled.implantBonusPct).toBe(original.implantBonusPct);
    expect(scaled.lines[0].quantity).toBe(original.lines[0].quantity);
    expect(scaled.lines[0].typeId).toBe(original.lines[0].typeId);
    expect(scaled.lines[0].batches).toBe(original.lines[0].batches);
    expect(scaled.lines[0].unitsLeftOver).toBe(original.lines[0].unitsLeftOver);
  });
});

describe('scaleUnitPrices', () => {
  const prices = new Map([
    [1, 100],
    [2, 50],
  ]);

  it('is the identity at 100%', () => {
    const scaled = scaleUnitPrices(prices, 100);
    expect(scaled.get(1)).toBe(100);
    expect(scaled.get(2)).toBe(50);
  });

  it('scales every price at 90%', () => {
    const scaled = scaleUnitPrices(prices, 90);
    expect(scaled.get(1)).toBeCloseTo(90);
    expect(scaled.get(2)).toBeCloseTo(45);
  });

  it('zeroes every price at 0%', () => {
    const scaled = scaleUnitPrices(prices, 0);
    expect(scaled.get(1)).toBe(0);
    expect(scaled.get(2)).toBe(0);
  });
});
