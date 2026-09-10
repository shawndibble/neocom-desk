import { describe, it, expect } from 'vitest';
import { comparePriceToToday } from './priceDivergence';

describe('comparePriceToToday', () => {
  it('reports the percent change from the mined-date price to today', () => {
    const result = comparePriceToToday(100, 120);
    expect(result).toEqual({
      minedDatePrice: 100,
      currentPrice: 120,
      percentChange: 20,
      significant: true,
    });
  });

  it('is not significant below the default 10% threshold', () => {
    const result = comparePriceToToday(100, 105);
    expect(result?.significant).toBe(false);
  });

  it('is significant at exactly the threshold', () => {
    const result = comparePriceToToday(100, 90);
    expect(result?.significant).toBe(true);
  });

  it('honors a caller-supplied threshold', () => {
    expect(comparePriceToToday(100, 103, 2)?.significant).toBe(true);
  });

  it('returns null when either price is zero or unpriced, rather than dividing by zero', () => {
    expect(comparePriceToToday(0, 100)).toBeNull();
    expect(comparePriceToToday(100, 0)).toBeNull();
  });
});
