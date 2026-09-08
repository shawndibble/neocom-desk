import { describe, it, expect } from 'vitest';
import { myOrderGaps } from './myOrderGap';

describe('myOrderGaps', () => {
  it('flags a sell order beaten by a cheaper competitor, with the gap to the cheapest rival', () => {
    const sell = [
      { order_id: 1, price: 100 },
      { order_id: 2, price: 90 },
      { order_id: 3, price: 95 },
    ];
    const result = myOrderGaps(sell, new Set([1]), false);
    expect(result.get(1)).toEqual({
      bestOtherPrice: 90,
      beaten: true,
      gapIsk: 10,
      gapPct: 10,
    });
  });

  it('reports a leading sell order as not beaten, still carrying the gap to the next-best rival', () => {
    const sell = [
      { order_id: 1, price: 90 },
      { order_id: 2, price: 100 },
    ];
    const result = myOrderGaps(sell, new Set([1]), false);
    expect(result.get(1)).toEqual({
      bestOtherPrice: 100,
      beaten: false,
      gapIsk: 10,
      gapPct: (10 / 90) * 100,
    });
  });

  it('flags a buy order beaten by a higher competitor', () => {
    const buy = [
      { order_id: 1, price: 100 },
      { order_id: 2, price: 110 },
    ];
    const result = myOrderGaps(buy, new Set([1]), true);
    expect(result.get(1)).toEqual({
      bestOtherPrice: 110,
      beaten: true,
      gapIsk: 10,
      gapPct: 10,
    });
  });

  it('reports null bestOtherPrice/gap when mine is the only order on this side', () => {
    const sell = [{ order_id: 1, price: 100 }];
    const result = myOrderGaps(sell, new Set([1]), false);
    expect(result.get(1)).toEqual({
      bestOtherPrice: null,
      beaten: false,
      gapIsk: null,
      gapPct: null,
    });
  });

  it('excludes every one of my own orders from the "other" pool, not just the one being scored', () => {
    const sell = [
      { order_id: 1, price: 100 },
      { order_id: 2, price: 90 },
      { order_id: 3, price: 200 },
    ];
    // Both 1 and 2 are mine — order 2 must never count as "beating" order 1.
    const result = myOrderGaps(sell, new Set([1, 2]), false);
    expect(result.get(1)).toEqual({
      bestOtherPrice: 200,
      beaten: false,
      gapIsk: 100,
      gapPct: 100,
    });
    expect(result.get(2)).toEqual({
      bestOtherPrice: 200,
      beaten: false,
      gapIsk: 110,
      gapPct: (110 / 90) * 100,
    });
  });

  it('omits an order that is not mine from the result map', () => {
    const sell = [
      { order_id: 1, price: 100 },
      { order_id: 2, price: 90 },
    ];
    const result = myOrderGaps(sell, new Set([1]), false);
    expect(result.has(2)).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns an empty map when none of the orders are mine', () => {
    const sell = [{ order_id: 1, price: 100 }];
    expect(myOrderGaps(sell, new Set(), false).size).toBe(0);
  });

  it('guards a non-positive own price when computing gapPct', () => {
    // Buy side: a higher rival price beats a lower one, so a (degenerate)
    // zero-ISK buy order of mine is beaten by any real bid.
    const buy = [
      { order_id: 1, price: 0 },
      { order_id: 2, price: 5 },
    ];
    const result = myOrderGaps(buy, new Set([1]), true);
    expect(result.get(1)).toEqual({
      bestOtherPrice: 5,
      beaten: true,
      gapIsk: 5,
      gapPct: 0,
    });
  });
});
