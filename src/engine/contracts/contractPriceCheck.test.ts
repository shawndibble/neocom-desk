import { describe, expect, it } from 'vitest';
import type { SidePrices } from '@/engine/miningTax/priceBasis';
import {
  iskPriceCheck,
  itemSwapPriceCheck,
  percentDifference,
  splitBySearch,
  valueLines,
} from './contractPriceCheck';

describe('percentDifference', () => {
  it('is negative when the asking price sits below the reference', () => {
    // (476,740,542 - 512,319,400) / 512,319,400 = -6.94…%
    expect(percentDifference(476_740_542, 512_319_400)).toBeCloseTo(-6.94, 2);
  });

  it('is positive when the asking price sits above the reference', () => {
    expect(percentDifference(7_257_000, 7_085_000)).toBeCloseTo(2.43, 2);
  });

  it('is null when there is no reference to compare against', () => {
    expect(percentDifference(100, 0)).toBeNull();
  });

  it('is null for a zero ask, which is a barter and not a price', () => {
    expect(percentDifference(0, 100)).toBeNull();
  });
});

describe('valueLines', () => {
  const lines = [
    { typeId: 28434, quantity: 590 },
    { typeId: 28433, quantity: 92_672 },
  ];

  it('sums quantity times unit price across the lines', () => {
    const units = new Map<number, number | null>([
      [28434, 12_300],
      [28433, 5_450],
    ]);
    // 590 x 12,300 = 7,257,000; 92,672 x 5,450 = 505,062,400
    expect(valueLines(lines, units)).toEqual({
      total: 512_319_400,
      pricedLines: 2,
      unpricedLines: 0,
    });
  });

  it('counts a line with no price as unpriced and leaves it out of the total, never as 0 ISK', () => {
    const units = new Map<number, number | null>([
      [28434, 12_300],
      [28433, null],
    ]);
    expect(valueLines(lines, units)).toEqual({
      total: 7_257_000,
      pricedLines: 1,
      unpricedLines: 1,
    });
  });

  it('never values a line marked unpriceable, even when its type has a market price', () => {
    // A blueprint copy shares its type with the original, which trades at the hub;
    // the copy itself never does, so the original's price must not stand in for it.
    const copyAndTrit = [
      { typeId: 691, quantity: 1, unpriceable: true as const },
      { typeId: 34, quantity: 10 },
    ];
    const units = new Map<number, number | null>([
      [691, 1_135_000_000],
      [34, 5],
    ]);
    expect(valueLines(copyAndTrit, units)).toEqual({ total: 50, pricedLines: 1, unpricedLines: 1 });
  });

  it('treats a type the price map has never heard of, and a zero price, as unpriced', () => {
    const units = new Map<number, number | null>([[28434, 0]]);
    expect(valueLines(lines, units)).toEqual({ total: 0, pricedLines: 0, unpricedLines: 2 });
  });
});

describe('iskPriceCheck', () => {
  const included = [
    { typeId: 28434, quantity: 590 },
    { typeId: 28433, quantity: 92_672 },
  ];
  const prices = new Map<number, SidePrices>([
    [28434, { buy: 12_300, sell: 13_100 }],
    [28433, { buy: 5_450, sell: 5_900 }],
  ]);

  it('values the included items at the chosen side and compares the ask to it', () => {
    const result = iskPriceCheck({ asking: 476_740_542, included, prices, side: 'buy' });
    expect(result).toMatchObject({ kind: 'priced', asking: 476_740_542, value: 512_319_400 });
    // 590 x 13,100 + 92,672 x 5,900 = 7,729,000 + 546,764,800
    const sell = iskPriceCheck({ asking: 476_740_542, included, prices, side: 'sell' });
    expect(sell).toMatchObject({ kind: 'priced', value: 554_493_800 });
    expect(sell.kind === 'priced' && sell.diff).toBeCloseTo(-14.02, 2);
  });

  it('is unavailable, never 0, when no line has a price on that side', () => {
    const noSell = new Map<number, SidePrices>([
      [28434, { buy: 12_300, sell: null }],
      [28433, { buy: 5_450, sell: null }],
    ]);
    expect(iskPriceCheck({ asking: 100, included, prices: noSell, side: 'sell' })).toEqual({
      kind: 'unavailable',
    });
  });

  it('reports how many lines it could not price, so the total is not read as complete', () => {
    const partial = new Map<number, SidePrices>([[28434, { buy: 12_300, sell: 13_100 }]]);
    expect(iskPriceCheck({ asking: 100, included, prices: partial, side: 'buy' })).toMatchObject({
      kind: 'priced',
      value: 7_257_000,
      unpricedLines: 1,
    });
  });

  it('has no percent for a zero ask', () => {
    const result = iskPriceCheck({ asking: 0, included, prices, side: 'buy' });
    expect(result).toMatchObject({ kind: 'priced', diff: null });
  });

  it('is unavailable when the contract has no item lines to value', () => {
    expect(iskPriceCheck({ asking: 100, included: [], prices, side: 'buy' })).toEqual({
      kind: 'unavailable',
    });
  });
});

describe('itemSwapPriceCheck', () => {
  const prices = new Map<number, SidePrices>([
    [28434, { buy: 12_300, sell: 13_100 }],
    [28433, { buy: 5_450, sell: 5_900 }],
  ]);
  const included = [{ typeId: 28434, quantity: 590 }];
  const requested = [{ typeId: 28433, quantity: 1_300 }];

  it('values both sides the same way and compares Included to Requested', () => {
    const result = itemSwapPriceCheck({ included, requested, prices, side: 'buy' });
    // 590 x 12,300 = 7,257,000 against 1,300 x 5,450 = 7,085,000
    expect(result).toMatchObject({ kind: 'priced', included: 7_257_000, requested: 7_085_000 });
    expect(result.kind === 'priced' && result.diff).toBeCloseTo(2.43, 2);
  });

  it('follows the chosen side', () => {
    // 590 x 13,100 = 7,729,000 against 1,300 x 5,900 = 7,670,000
    expect(itemSwapPriceCheck({ included, requested, prices, side: 'sell' })).toMatchObject({
      included: 7_729_000,
      requested: 7_670_000,
    });
  });

  it('is unavailable when either side cannot be priced: half a comparison says nothing', () => {
    const onlyIncluded = new Map<number, SidePrices>([[28434, { buy: 12_300, sell: 13_100 }]]);
    expect(itemSwapPriceCheck({ included, requested, prices: onlyIncluded, side: 'buy' })).toEqual({
      kind: 'unavailable',
    });
  });
});

describe('splitBySearch', () => {
  const lines = [
    { typeId: 28434, quantity: 590 },
    { typeId: 28433, quantity: 92_672 },
  ];
  const units = new Map<number, number | null>([
    [28434, 13_100],
    [28433, 5_900],
  ]);

  it('splits the value into the searched lines and everything else, summing to the whole', () => {
    const split = splitBySearch(lines, new Set([28434]), units);
    expect(split).toEqual({
      mine: { total: 7_729_000, pricedLines: 1, unpricedLines: 0 },
      rest: { total: 546_764_800, pricedLines: 1, unpricedLines: 0 },
    });
    expect(split && split.mine.total + split.rest.total).toBe(valueLines(lines, units).total);
  });

  it('is null when no search is active, so nothing is tagged', () => {
    expect(splitBySearch(lines, null, units)).toBeNull();
  });

  it('is null when none of the lines is the searched type', () => {
    expect(splitBySearch(lines, new Set([999]), units)).toBeNull();
  });
});
