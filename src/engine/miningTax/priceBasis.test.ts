import { describe, expect, it } from 'vitest';
import {
  PRICE_BASES,
  basisSide,
  mergeSnapshotDay,
  resolveTaxUnitPrice,
  resolveUnitPrice,
} from './priceBasis';

const TODAY = '2026-09-22';
const saved = { buy: 90, sell: 110 };
const live = { buy: 95, sell: 115 };

describe('resolveUnitPrice — mined-day bases', () => {
  it("uses the day's hub price for the chosen side", () => {
    expect(resolveUnitPrice({ day: saved, live }, 'buy', '2026-09-10', TODAY)).toBe(90);
    expect(resolveUnitPrice({ day: saved, live }, 'sell', '2026-09-10', TODAY)).toBe(110);
  });

  it('is unpriced when the day has no orders on that side', () => {
    expect(
      resolveUnitPrice({ day: { buy: null, sell: 110 }, live }, 'buy', '2026-09-10', TODAY)
    ).toBeUndefined();
  });

  it('falls back to the live price for today and yesterday, before the day is published', () => {
    expect(resolveUnitPrice({ live }, 'buy', TODAY, TODAY)).toBe(95);
    expect(resolveUnitPrice({ live }, 'sell', '2026-09-21', TODAY)).toBe(115);
  });

  it("never prices an older day at today's live price", () => {
    expect(resolveUnitPrice({ live }, 'buy', '2026-09-20', TODAY)).toBeUndefined();
  });
});

describe('resolveUnitPrice — now bases', () => {
  it("uses today's live price for every day, whatever the day's price", () => {
    expect(resolveUnitPrice({ day: saved, live }, 'now-buy', '2026-08-01', TODAY)).toBe(95);
    expect(resolveUnitPrice({ day: saved, live }, 'now-sell', '2026-08-01', TODAY)).toBe(115);
  });

  it('is unpriced when the live book has no orders on that side', () => {
    expect(
      resolveUnitPrice({ day: saved, live: { buy: null, sell: 1 } }, 'now-buy', TODAY, TODAY)
    ).toBeUndefined();
  });
});

describe('resolveTaxUnitPrice', () => {
  const historical = { buy: 80, sell: 120 };

  it("uses the saved snapshot's buy side first", () => {
    expect(resolveTaxUnitPrice({ saved, historical, live })).toEqual({
      price: 90,
      source: 'saved',
    });
  });

  it('falls back to the historical split when nothing was saved', () => {
    expect(resolveTaxUnitPrice({ historical, live })).toEqual({ price: 80, source: 'historical' });
  });

  it("falls back to today's live buy for ANY day, not just today/yesterday — Tax always bills at today's price when nothing day-specific exists", () => {
    expect(resolveTaxUnitPrice({ live })).toEqual({ price: 95, source: 'live' });
  });

  it('skips a saved side with no buy orders and falls to historical', () => {
    expect(resolveTaxUnitPrice({ saved: { buy: null, sell: 110 }, historical })).toEqual({
      price: 80,
      source: 'historical',
    });
  });

  it('skips a historical side with no buy orders and falls to live', () => {
    expect(resolveTaxUnitPrice({ historical: { buy: null, sell: 120 }, live })).toEqual({
      price: 95,
      source: 'live',
    });
  });

  it("falls back to today's live SELL when no book has a buy side — a thin ore is worth its ask, not 0", () => {
    expect(
      resolveTaxUnitPrice({
        saved: { buy: null, sell: 110 },
        historical: { buy: null, sell: 120 },
        live: { buy: null, sell: 115 },
      })
    ).toEqual({ price: 115, source: 'live-sell' });
  });

  it('prefers any buy price, even a live one, over the live sell', () => {
    expect(resolveTaxUnitPrice({ live })).toEqual({ price: 95, source: 'live' });
  });

  it('is unpriced only when today has no orders on either side', () => {
    expect(resolveTaxUnitPrice({})).toEqual({ price: undefined, source: 'none' });
    expect(
      resolveTaxUnitPrice({
        saved: { buy: null, sell: 1 },
        historical: { buy: null, sell: 1 },
        live: { buy: null, sell: null },
      })
    ).toEqual({ price: undefined, source: 'none' });
  });
});

describe('basisSide', () => {
  it('names the order-book side of each basis', () => {
    expect(PRICE_BASES.map(basisSide)).toEqual(['buy', 'sell', 'buy', 'sell']);
  });
});

describe('mergeSnapshotDay', () => {
  it("overwrites a type's saved prices and keeps types this fetch did not price", () => {
    expect(
      mergeSnapshotDay(
        { 1: { buy: 1, sell: 2 }, 2: { buy: 3, sell: 4 } },
        { 1: { buy: 5, sell: 6 } }
      )
    ).toEqual({ 1: { buy: 5, sell: 6 }, 2: { buy: 3, sell: 4 } });
  });
});
