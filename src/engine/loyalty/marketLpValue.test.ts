import { describe, expect, it } from 'vitest';
import { lpRate, marketLpValue } from './marketLpValue';

const offer = (iskPerLp: number | null, sellVolume = 100, quantity = 1) => ({
  iskPerLp,
  sellVolume,
  quantity,
});

describe('marketLpValue', () => {
  it('is the median of the five best offers by ISK/LP', () => {
    const value = marketLpValue([
      offer(2500),
      offer(1800),
      offer(1500),
      offer(1400),
      offer(1200),
      offer(900),
      offer(300),
    ]);
    expect(value).toBe(1500);
  });

  it('ignores an offer the hub could not absorb five redemptions of', () => {
    // 9,000 ISK/LP on 3 units for sale is one lucky order, not a rate.
    const value = marketLpValue([offer(9000, 3), offer(1500), offer(1400), offer(1300)]);
    expect(value).toBe(1400);
  });

  it('counts depth in redemptions, not units', () => {
    // 40 units for sale of an offer that hands out 10 is only 4 redemptions deep.
    expect(marketLpValue([offer(5000, 40, 10), offer(1000), offer(900), offer(800)])).toBe(900);
  });

  it('skips offers that lose ISK or cannot be priced', () => {
    expect(marketLpValue([offer(-50), offer(null), offer(1200), offer(1100), offer(1000)])).toBe(
      1100
    );
  });

  it('has no value with fewer than three offers to go on', () => {
    expect(marketLpValue([offer(1500), offer(1400)])).toBeNull();
    expect(marketLpValue([])).toBeNull();
  });
});

describe('lpRate', () => {
  it('uses the pilot’s own LP Value whenever one is set', () => {
    expect(lpRate(2000, 1450)).toEqual({ rate: 2000, source: 'yours' });
    expect(lpRate(2000, null)).toEqual({ rate: 2000, source: 'yours' });
  });

  it('falls back to the store’s market value when none is set', () => {
    expect(lpRate(0, 1450)).toEqual({ rate: 1450, source: 'market' });
  });

  it('leaves the LP unpriced — never free — when neither is known', () => {
    expect(lpRate(0, null)).toEqual({ rate: null, source: null });
    expect(lpRate(Number.NaN, null)).toEqual({ rate: null, source: null });
  });
});
