import { describe, expect, it } from 'vitest';
import {
  PRICE_BASES,
  basisSide,
  countDaysBySource,
  mergeSnapshotDay,
  prunePriceSnapshotDates,
  resolveTaxUnitPrice,
  resolveUnitPrice,
  weakestSource,
} from './priceBasis';

const TODAY = '2026-09-22';
const saved = { buy: 90, sell: 110 };
const live = { buy: 95, sell: 115 };

describe('resolveUnitPrice — mined-day bases', () => {
  it("uses the day's saved price for the chosen side first", () => {
    expect(resolveUnitPrice({ saved, average: 100, live }, 'buy', '2026-09-10', TODAY)).toEqual({
      price: 90,
      source: 'saved',
    });
    expect(resolveUnitPrice({ saved, average: 100, live }, 'sell', '2026-09-10', TODAY)).toEqual({
      price: 110,
      source: 'saved',
    });
  });

  it('falls back to the ESI daily average when nothing was saved that day', () => {
    expect(resolveUnitPrice({ average: 100, live }, 'buy', '2026-09-10', TODAY)).toEqual({
      price: 100,
      source: 'average',
    });
  });

  it('skips a saved side with no orders and uses the average instead', () => {
    expect(
      resolveUnitPrice(
        { saved: { buy: null, sell: 110 }, average: 100 },
        'buy',
        '2026-09-10',
        TODAY
      )
    ).toEqual({ price: 100, source: 'average' });
  });

  const historical = { buy: 80, sell: 120 };

  it("uses Adam4EVE's historical buy/sell split ahead of the ESI average when nothing was saved", () => {
    expect(resolveUnitPrice({ historical, average: 100 }, 'buy', '2026-09-10', TODAY)).toEqual({
      price: 80,
      source: 'historical',
    });
    expect(resolveUnitPrice({ historical, average: 100 }, 'sell', '2026-09-10', TODAY)).toEqual({
      price: 120,
      source: 'historical',
    });
  });

  it('skips a historical side with no orders and uses the average instead', () => {
    expect(
      resolveUnitPrice(
        { historical: { buy: null, sell: 120 }, average: 100 },
        'buy',
        '2026-09-10',
        TODAY
      )
    ).toEqual({ price: 100, source: 'average' });
  });

  it('still prefers the saved snapshot over the historical split', () => {
    expect(
      resolveUnitPrice({ saved, historical, average: 100 }, 'buy', '2026-09-10', TODAY)
    ).toEqual({ price: 90, source: 'saved' });
  });

  it('falls back to the live price for today and yesterday, before ESI publishes history', () => {
    expect(resolveUnitPrice({ live }, 'buy', TODAY, TODAY)).toEqual({ price: 95, source: 'live' });
    expect(resolveUnitPrice({ live }, 'sell', '2026-09-21', TODAY)).toEqual({
      price: 115,
      source: 'live',
    });
  });

  it("never prices an older day at today's live price", () => {
    expect(resolveUnitPrice({ live }, 'buy', '2026-09-20', TODAY)).toEqual({
      price: undefined,
      source: 'none',
    });
  });
});

describe('resolveUnitPrice — now bases', () => {
  it("uses today's live price for every day, whatever was saved", () => {
    expect(resolveUnitPrice({ saved, average: 100, live }, 'now-buy', '2026-08-01', TODAY)).toEqual(
      {
        price: 95,
        source: 'live',
      }
    );
    expect(resolveUnitPrice({ saved, live }, 'now-sell', '2026-08-01', TODAY)).toEqual({
      price: 115,
      source: 'live',
    });
  });

  it('is unpriced when the live book has no orders on that side', () => {
    expect(
      resolveUnitPrice(
        { saved, average: 100, live: { buy: null, sell: 1 } },
        'now-buy',
        TODAY,
        TODAY
      )
    ).toEqual({ price: undefined, source: 'none' });
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

  it('is unpriced when nothing has a buy side at all', () => {
    expect(resolveTaxUnitPrice({})).toEqual({ price: undefined, source: 'none' });
    expect(
      resolveTaxUnitPrice({
        saved: { buy: null, sell: 1 },
        historical: { buy: null, sell: 1 },
        live: { buy: null, sell: 1 },
      })
    ).toEqual({ price: undefined, source: 'none' });
  });
});

describe('basisSide', () => {
  it('names the order-book side of each basis', () => {
    expect(PRICE_BASES.map(basisSide)).toEqual(['buy', 'sell', 'buy', 'sell']);
  });
});

describe('weakestSource', () => {
  it('ranks saved, then live, then historical, then daily average, ignoring unpriced lines', () => {
    expect(weakestSource(['saved', 'saved'])).toBe('saved');
    expect(weakestSource(['saved', 'live'])).toBe('live');
    expect(weakestSource(['live', 'average', 'saved'])).toBe('average');
    expect(weakestSource(['saved', 'none'])).toBe('saved');
    expect(weakestSource(['live', 'historical'])).toBe('historical');
    expect(weakestSource(['historical', 'average'])).toBe('average');
  });

  it('is none only when nothing was priced', () => {
    expect(weakestSource(['none'])).toBe('none');
    expect(weakestSource([])).toBe('none');
  });
});

describe('countDaysBySource', () => {
  it("counts each day once, by the weakest source among that day's rows", () => {
    expect(
      countDaysBySource([
        { date: '2026-09-20', source: 'saved' },
        { date: '2026-09-20', source: 'average' },
        { date: '2026-09-21', source: 'saved' },
        { date: '2026-09-22', source: 'live' },
        { date: '2026-09-23', source: 'historical' },
      ])
    ).toEqual({ total: 4, saved: 1, historical: 1, average: 1, live: 1, none: 0 });
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

describe('prunePriceSnapshotDates', () => {
  it('lists the saved days older than the 90-day window, today counted as day one', () => {
    expect(prunePriceSnapshotDates(['2026-06-24', '2026-06-25', TODAY], TODAY)).toEqual([
      '2026-06-24',
    ]);
  });
});
