import { describe, it, expect } from 'vitest';
import { priceTick, roundPriceDown, roundPriceUp, undercutPrice, outbidPrice } from './priceTick';

describe('priceTick', () => {
  it.each([
    [0.01, 0.01],
    [1, 0.01],
    [5, 0.01],
    [9.99, 0.01],
    [10, 0.01],
    [50, 0.01],
    [99.99, 0.01],
    [100, 0.1],
    [500, 0.1],
    [999.9, 0.1],
    [1000, 1],
    [5000, 1],
    [9999, 1],
    [10000, 10],
    [1_000_000, 1000],
    [9_999_000, 1000],
    [1_000_000_000, 1_000_000],
  ])('is %s for a price of %s', (price, expected) => {
    expect(priceTick(price)).toBeCloseTo(expected, 6);
  });

  it('returns null for non-finite or non-positive input', () => {
    expect(priceTick(0)).toBeNull();
    expect(priceTick(-5)).toBeNull();
    expect(priceTick(NaN)).toBeNull();
    expect(priceTick(Infinity)).toBeNull();
  });
});

describe('roundPriceDown', () => {
  it('leaves an already-legal price untouched', () => {
    expect(roundPriceDown(999.9)).toBeCloseTo(999.9, 6);
    expect(roundPriceDown(1234)).toBe(1234);
    expect(roundPriceDown(0.01)).toBeCloseTo(0.01, 6);
  });

  it('rounds down to the nearest legal price within a band', () => {
    expect(roundPriceDown(1234.56)).toBe(1234);
    expect(roundPriceDown(123.456)).toBeCloseTo(123.4, 6);
    expect(roundPriceDown(12.345)).toBeCloseTo(12.34, 6);
  });

  it('never rounds down below the 0.01 minimum', () => {
    expect(roundPriceDown(0.015)).toBeCloseTo(0.01, 6);
  });

  it('returns null for a positive sub-cent input with no legal price at or below it', () => {
    // 0.005 rounds down to 0 cents, which is not a legal price — must not
    // silently return 0, only ever a real legal price or null.
    expect(roundPriceDown(0.005)).toBeNull();
    expect(roundPriceDown(0.001)).toBeNull();
  });

  it('returns null for non-finite or non-positive input', () => {
    expect(roundPriceDown(0)).toBeNull();
    expect(roundPriceDown(-1)).toBeNull();
    expect(roundPriceDown(NaN)).toBeNull();
  });
});

describe('roundPriceUp', () => {
  it('leaves an already-legal price untouched', () => {
    expect(roundPriceUp(999.9)).toBeCloseTo(999.9, 6);
    expect(roundPriceUp(1234)).toBe(1234);
  });

  it('rounds up to the nearest legal price within a band, staying safe', () => {
    expect(roundPriceUp(1234.01)).toBe(1235);
    expect(roundPriceUp(123.41)).toBeCloseTo(123.5, 6);
    expect(roundPriceUp(12.341)).toBeCloseTo(12.35, 6);
  });

  it('crosses a magnitude boundary upward when the exact value spills past the band max', () => {
    // 999.95 has no legal price at or below it inside the 100-999.9 band that
    // is still >= it, so the safe answer spills into the next band.
    expect(roundPriceUp(999.95)).toBe(1000);
  });

  it('returns null for non-finite or non-positive input', () => {
    expect(roundPriceUp(0)).toBeNull();
    expect(roundPriceUp(-1)).toBeNull();
    expect(roundPriceUp(NaN)).toBeNull();
  });
});

describe('undercutPrice', () => {
  it('steps down by one legal tick within the same band', () => {
    expect(undercutPrice(450)).toBeCloseTo(449.9, 6);
    expect(undercutPrice(9998)).toBe(9997);
    expect(undercutPrice(123.4)).toBeCloseTo(123.3, 6);
  });

  it('crosses a magnitude boundary downward at an exact power of ten, using the smaller tick below it', () => {
    expect(undercutPrice(1000)).toBe(999.9);
    expect(undercutPrice(10000)).toBe(9999);
    expect(undercutPrice(100)).toBeCloseTo(99.99, 6);
    expect(undercutPrice(10)).toBeCloseTo(9.99, 6);
  });

  it('returns the largest legal price strictly below the rival, never a tie', () => {
    const rival = 450;
    const result = undercutPrice(rival);
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThan(rival);
  });

  it('returns null once undercutting would fall below the 0.01 minimum tick', () => {
    expect(undercutPrice(0.01)).toBeNull();
  });

  it('returns null for non-finite or non-positive input', () => {
    expect(undercutPrice(0)).toBeNull();
    expect(undercutPrice(-5)).toBeNull();
    expect(undercutPrice(NaN)).toBeNull();
    expect(undercutPrice(Infinity)).toBeNull();
  });
});

describe('outbidPrice', () => {
  it('steps up by one legal tick within the same band', () => {
    expect(outbidPrice(450)).toBeCloseTo(450.1, 6);
    expect(outbidPrice(123.4)).toBeCloseTo(123.5, 6);
  });

  it('crosses a magnitude boundary upward at the top of a band, landing exactly on the next one', () => {
    expect(outbidPrice(9999)).toBe(10000);
    expect(outbidPrice(999.9)).toBe(1000);
    expect(outbidPrice(99.99)).toBeCloseTo(100, 6);
  });

  it('returns the smallest legal price strictly above the rival, never a tie', () => {
    const rival = 520;
    const result = outbidPrice(rival);
    expect(result).not.toBeNull();
    expect(result as number).toBeGreaterThan(rival);
  });

  it('returns null for non-finite or non-positive input', () => {
    expect(outbidPrice(0)).toBeNull();
    expect(outbidPrice(-5)).toBeNull();
    expect(outbidPrice(NaN)).toBeNull();
    expect(outbidPrice(Infinity)).toBeNull();
  });
});
