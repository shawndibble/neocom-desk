import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICE_PERCENT,
  MAX_PRICE_PERCENT,
  MIN_PRICE_PERCENT,
  isValidPricePercent,
  parsePricePercentParam,
} from './pricePercent';

describe('isValidPricePercent', () => {
  it('accepts the range the field offers, endpoints included', () => {
    expect(isValidPricePercent(MIN_PRICE_PERCENT)).toBe(true);
    expect(isValidPricePercent(MAX_PRICE_PERCENT)).toBe(true);
    expect(isValidPricePercent(DEFAULT_PRICE_PERCENT)).toBe(true);
    expect(isValidPricePercent(90)).toBe(true);
    expect(isValidPricePercent(92.5)).toBe(true);
  });

  it('rejects a value outside the range', () => {
    expect(isValidPricePercent(MIN_PRICE_PERCENT - 1)).toBe(false);
    expect(isValidPricePercent(MAX_PRICE_PERCENT + 1)).toBe(false);
  });

  /**
   * The guard also runs over values pulled from another device, which may
   * have been written by an older build — `lib/useSyncedSetting.ts` re-parses
   * for exactly this reason, so it has to reject non-numbers too.
   */
  it('rejects values that are not finite numbers', () => {
    expect(isValidPricePercent(Number.NaN)).toBe(false);
    expect(isValidPricePercent(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPricePercent(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('defaults to the order book untouched', () => {
    expect(DEFAULT_PRICE_PERCENT).toBe(100);
  });
});

describe('parsePricePercentParam', () => {
  it('reads a Price Percent from the URL', () => {
    expect(parsePricePercentParam('90')).toBe(90);
    expect(parsePricePercentParam('87.5')).toBe(87.5);
    expect(parsePricePercentParam('0')).toBe(0);
  });

  it('ignores a missing, blank, non-numeric or out-of-range value', () => {
    expect(parsePricePercentParam(null)).toBeNull();
    expect(parsePricePercentParam('')).toBeNull();
    expect(parsePricePercentParam('abc')).toBeNull();
    expect(parsePricePercentParam('-5')).toBeNull();
    expect(parsePricePercentParam('5000')).toBeNull();
  });
});
