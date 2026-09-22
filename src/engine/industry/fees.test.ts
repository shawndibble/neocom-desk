import { describe, it, expect } from 'vitest';
import {
  salesTaxPct,
  brokerFeePct,
  salesTax,
  brokerFee,
  breakEvenPrice,
  relistDiscountPct,
  relistBrokerFeePct,
  relistFee,
  relistBreakEvenPrice,
} from '@/engine/industry/fees';

describe('salesTaxPct', () => {
  it('is 7.5% base, reduced 11% per Accounting level', () => {
    expect(salesTaxPct(0)).toBeCloseTo(7.5, 12);
    expect(salesTaxPct(4)).toBeCloseTo(4.2, 12);
    expect(salesTaxPct(5)).toBeCloseTo(3.375, 12);
  });

  it('rejects levels outside 0..5', () => {
    expect(() => salesTaxPct(-1)).toThrow(RangeError);
    expect(() => salesTaxPct(6)).toThrow(RangeError);
  });
});

describe('brokerFeePct', () => {
  it('is 3% base at NPC stations, minus 0.3% per Broker Relations level', () => {
    expect(brokerFeePct(0)).toBeCloseTo(3, 12);
    expect(brokerFeePct(3)).toBeCloseTo(2.1, 12);
    expect(brokerFeePct(5)).toBeCloseTo(1.5, 12);
  });

  it('applies faction (0.03%/pt) and corp (0.02%/pt) standing reductions', () => {
    expect(brokerFeePct(5, 10, 10)).toBeCloseTo(1.5 - 0.3 - 0.2, 12);
  });

  it('never goes below zero', () => {
    expect(brokerFeePct(5, 10, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe('salesTax', () => {
  it('is order value times the tax rate', () => {
    expect(salesTax(1_000_000, 5)).toBeCloseTo(33_750, 6);
    expect(salesTax(0, 5)).toBe(0);
  });
});

describe('brokerFee', () => {
  it('is order value times the fee rate', () => {
    expect(brokerFee(1_000_000, 5)).toBeCloseTo(15_000, 6);
  });

  it('applies the 100 ISK minimum for a nonzero order', () => {
    expect(brokerFee(1_000, 5)).toBe(100); // 15 ISK raw -> min 100
    expect(brokerFee(0, 5)).toBe(0);
  });
});

describe('breakEvenPrice', () => {
  it('solves from the tax/broker rates when the percentage fee exceeds the 100 ISK minimum', () => {
    // revenue 10_000: tax 7.5% (750) + broker 3% (300, above the 100 min) = totalCost 8_950
    expect(breakEvenPrice(8_950, 100, 0, 0)).toBeCloseTo(100, 6);
  });

  it('re-solves against the 100 ISK broker-fee minimum when the percentage fee would bind below it', () => {
    // revenue 1_000: tax 7.5% (75) + broker floored at 100 (raw 3% = 30) = totalCost 825
    expect(breakEvenPrice(825, 10, 0, 0)).toBeCloseTo(100, 6);
  });

  it('returns 0 for a zero total cost instead of dividing by zero revenue', () => {
    expect(breakEvenPrice(0, 10, 5, 5)).toBe(0);
  });

  it('returns null for a non-positive quantity', () => {
    expect(breakEvenPrice(1_000, 0, 0, 0)).toBeNull();
    expect(breakEvenPrice(1_000, -1, 0, 0)).toBeNull();
  });
});

describe('relistDiscountPct', () => {
  it('is 50% base, +6 points per Advanced Broker Relations level, 80% at V', () => {
    expect(relistDiscountPct(0)).toBeCloseTo(50, 12);
    expect(relistDiscountPct(3)).toBeCloseTo(68, 12);
    expect(relistDiscountPct(5)).toBeCloseTo(80, 12);
  });

  it('rejects levels outside 0..5', () => {
    expect(() => relistDiscountPct(-1)).toThrow(RangeError);
    expect(() => relistDiscountPct(6)).toThrow(RangeError);
  });
});

describe('relistBrokerFeePct', () => {
  it('applies the 50% base discount to the broker rate even without the skill', () => {
    expect(relistBrokerFeePct(0, 0)).toBeCloseTo(3 * 0.5, 12);
  });

  it('applies the deeper discount per Advanced Broker Relations level', () => {
    // Broker Relations V -> 1.5% base rate; ABR V -> 80% discount -> 0.3%
    expect(relistBrokerFeePct(5, 5)).toBeCloseTo(1.5 * 0.2, 12);
  });
});

describe('relistFee', () => {
  it('charges only the discounted rate on the full new total for a price decrease', () => {
    // Broker Relations V (1.5%), ABR V (80% discount) -> 0.3% of new total
    expect(relistFee(200, 100, 1_000, 5, 5)).toBeCloseTo(100 * 1_000 * 0.003, 6);
  });

  it('adds the full undiscounted rate on the increase increment for a price increase', () => {
    const quantity = 1_000;
    const oldPrice = 100;
    const newPrice = 120;
    const increaseFee = (newPrice - oldPrice) * quantity * (1.5 / 100);
    const discountedFee = newPrice * quantity * (0.3 / 100);
    expect(relistFee(oldPrice, newPrice, quantity, 5, 5)).toBeCloseTo(
      increaseFee + discountedFee,
      6
    );
  });

  it('a character without the skill still gets the 50% base discount', () => {
    expect(relistFee(200, 100, 1_000, 0, 0)).toBeCloseTo((100 * 1_000 * (3 * 0.5)) / 100, 6);
  });

  it('applies the 100 ISK minimum for a nonzero order', () => {
    expect(relistFee(20, 10, 1, 5, 5)).toBe(100);
    expect(relistFee(0, 0, 1, 5, 5)).toBe(0);
  });
});

describe('relistBreakEvenPrice', () => {
  it('matches breakEvenPrice when Advanced Broker Relations is at level 0 but discounts the rate', () => {
    // Same fee/tax rates as breakEvenPrice's own equivalent test, but at half
    // the broker rate (50% base discount), so revenue clears at a lower price.
    const full = breakEvenPrice(8_950, 100, 0, 0);
    const relist = relistBreakEvenPrice(8_950, 100, 0, 0, 0);
    expect(relist).not.toBeNull();
    expect(full).not.toBeNull();
    expect(relist as number).toBeLessThan(full as number);
  });

  it('returns null for a non-positive quantity', () => {
    expect(relistBreakEvenPrice(1_000, 0, 0, 0, 0)).toBeNull();
  });
});
