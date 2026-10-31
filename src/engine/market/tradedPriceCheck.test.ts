import { describe, expect, it } from 'vitest';
import {
  LISTED_ABOVE_TRADES_FACTOR,
  capListedPrice,
  checkListedPrice,
  tradedPriceCeiling,
} from '@/engine/market/tradedPriceCheck';

// Jita, from the daily demand object of 2026-10-29.
const LONE_BILLION_ORDER = {
  recentSalePrice: 17_300_000,
  latestDay: { date: '2026-10-28', highest: 17_290_000, lowest: 17_260_000 },
};
const RISING_PRICE = {
  recentSalePrice: 62_390_000,
  latestDay: { date: '2026-10-28', highest: 134_200_000, lowest: 126_900_000 },
};

describe('tradedPriceCeiling', () => {
  it('is the higher of the recent median sale and the latest day’s lowest trade', () => {
    expect(tradedPriceCeiling(LONE_BILLION_ORDER)).toBe(17_300_000);
    expect(tradedPriceCeiling(RISING_PRICE)).toBe(126_900_000);
  });

  it('bounds a latest day that only traded far above the median (a self-trade)', () => {
    const selfTrade = {
      recentSalePrice: 17_300_000,
      latestDay: { date: '2026-10-29', highest: 1_000_000_000, lowest: 1_000_000_000 },
    };
    expect(tradedPriceCeiling(selfTrade)).toBe(17_300_000 * 3);
    expect(checkListedPrice(1_000_000_000, selfTrade).capped).toBe(true);
  });

  it('is null with nothing traded to go on', () => {
    expect(tradedPriceCeiling({ recentSalePrice: null, latestDay: null })).toBeNull();
    expect(tradedPriceCeiling(undefined)).toBeNull();
  });
});

describe('checkListedPrice', () => {
  it('prices a listing far above every recent trade at the trades', () => {
    expect(checkListedPrice(1_000_000_000, LONE_BILLION_ORDER)).toEqual({
      price: 17_300_000,
      listed: 1_000_000_000,
      ceiling: 17_300_000,
      capped: true,
    });
  });

  it('keeps a listing inside the latest day’s trading', () => {
    expect(checkListedPrice(129_900_000, RISING_PRICE)).toEqual({
      price: 129_900_000,
      listed: 129_900_000,
      ceiling: 126_900_000,
      capped: false,
    });
  });

  it('keeps a listing up to the tolerance above the trades', () => {
    const edge = 17_300_000 * LISTED_ABOVE_TRADES_FACTOR;
    expect(checkListedPrice(edge, LONE_BILLION_ORDER).capped).toBe(false);
    expect(checkListedPrice(edge + 1, LONE_BILLION_ORDER).capped).toBe(true);
  });

  it('keeps the listing when nothing traded recently', () => {
    expect(checkListedPrice(5_000, undefined)).toEqual({
      price: 5_000,
      listed: 5_000,
      ceiling: null,
      capped: false,
    });
  });

  it('caps against a ceiling already worked out', () => {
    expect(capListedPrice(100, 50).price).toBe(50);
    expect(capListedPrice(60, 50).price).toBe(60);
    expect(capListedPrice(100, null).price).toBe(100);
  });
});
