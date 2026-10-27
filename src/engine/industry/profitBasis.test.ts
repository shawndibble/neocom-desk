import { describe, expect, it } from 'vitest';
import { breakEvenPrice } from './fees';
import { profitOnBasis, type ProfitBasisInput } from './profitBasis';

// The Raven plan the redesign was drawn from: one run, 147.9M market price,
// 86.8M total cost, 48.85M of owned Pyerite and Tritanium.
const raven: ProfitBasisInput = {
  result: {
    profit: 52_275_610,
    revenue: 147_900_000,
    marginPct: 35.35,
    iskPerHour: 25_645_413,
    breakEvenPrice: 92_307_620,
    totalCost: 86_800_333,
    seconds: 7_338,
  },
  ownedSellNet: 48_846_855,
  productQuantity: 1,
  productUnitPrice: 147_900_000,
  accountingLevel: 0,
  brokerRelationsLevel: 0,
};

describe('profitOnBasis', () => {
  it('passes the plan figures through when owned materials count as free', () => {
    const figures = profitOnBasis('free', raven);
    expect(figures.profit).toBe(52_275_610);
    expect(figures.marginPct).toBe(35.35);
    expect(figures.iskPerHour).toBe(25_645_413);
    expect(figures.breakEvenPrice).toBe(92_307_620);
    expect(figures.headroomPct).toBeCloseTo(37.59, 1);
    expect(figures.verdict).toBe('profitable');
  });

  it('charges what the owned materials would sell for on the sell-value basis', () => {
    const figures = profitOnBasis('sellValue', raven);
    expect(figures.profit).toBe(52_275_610 - 48_846_855);
    expect(figures.marginPct).toBeCloseTo((3_428_755 / 147_900_000) * 100, 6);
    expect(figures.iskPerHour).toBeCloseTo(3_428_755 / (7_338 / 3600), 3);
    expect(figures.breakEvenPrice).toBe(breakEvenPrice(86_800_333 + 48_846_855, 1, 0, 0));
  });

  it('calls a positive profit with under 5% price headroom a close call', () => {
    const figures = profitOnBasis('sellValue', raven);
    expect(figures.headroomPct).toBeLessThan(5);
    expect(figures.verdict).toBe('closeCall');
  });

  it('calls a negative profit a loss', () => {
    const figures = profitOnBasis('sellValue', { ...raven, ownedSellNet: 60_000_000 });
    expect(figures.verdict).toBe('loss');
  });

  it('falls back to the plan figures when there is no sale value to charge', () => {
    const figures = profitOnBasis('sellValue', { ...raven, ownedSellNet: null });
    expect(figures.profit).toBe(52_275_610);
  });

  it('has no verdict or headroom without a profit or a market price', () => {
    const noPrice = profitOnBasis('free', {
      ...raven,
      result: { ...raven.result, profit: null, marginPct: null, iskPerHour: null },
      productUnitPrice: null,
    });
    expect(noPrice.verdict).toBe('unknown');
    expect(noPrice.headroomPct).toBeNull();
  });
});
