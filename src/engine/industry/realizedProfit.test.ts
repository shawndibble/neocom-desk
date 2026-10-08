import { describe, it, expect } from 'vitest';
import {
  realizedProfit,
  runLoss,
  soldUnitsMargin,
  validateLossQuantity,
} from '@/engine/industry/realizedProfit';

describe('realizedProfit', () => {
  it('computes net revenue and profit for a fully-confirmed sale', () => {
    const r = realizedProfit({
      materialCost: 500_000,
      jobFee: 50_000,
      quantitySold: 10,
      grossRevenue: 1_000_000,
      accountingLevel: 5,
      brokerFeeableRevenue: 0,
      brokerRelationsLevel: 5,
    });

    // salesTaxPct(5) = 7.5 * (1 - 0.11*5) = 3.375%
    expect(r.totalCost).toBe(550_000);
    expect(r.salesTax).toBeCloseTo(33_750, 5);
    expect(r.brokerFee).toBe(0);
    expect(r.netRevenue).toBeCloseTo(1_000_000 - 33_750, 5);
    expect(r.profit).toBeCloseTo(1_000_000 - 33_750 - 550_000, 5);
    expect(r.marginPct).toBeCloseTo((r.profit / 1_000_000) * 100, 5);
  });

  it('charges broker fee only against the broker-feeable (watched-order) portion of revenue', () => {
    const r = realizedProfit({
      materialCost: 0,
      jobFee: 0,
      quantitySold: 10,
      grossRevenue: 1_000_000,
      accountingLevel: 0,
      brokerFeeableRevenue: 400_000,
      brokerRelationsLevel: 0,
    });

    // brokerFeePct(0) = 3%
    expect(r.brokerFee).toBeCloseTo(12_000, 5);
  });

  it('returns a null margin when nothing has sold yet', () => {
    const r = realizedProfit({
      materialCost: 500_000,
      jobFee: 50_000,
      quantitySold: 0,
      grossRevenue: 0,
      accountingLevel: 0,
      brokerFeeableRevenue: 0,
      brokerRelationsLevel: 0,
    });

    expect(r.marginPct).toBeNull();
    expect(r.profit).toBe(0 - 550_000);
  });

  it('reports a loss when net revenue undershoots the snapshotted cost', () => {
    const r = realizedProfit({
      materialCost: 900_000,
      jobFee: 100_000,
      quantitySold: 1,
      grossRevenue: 500_000,
      accountingLevel: 0,
      brokerFeeableRevenue: 0,
      brokerRelationsLevel: 0,
    });

    expect(r.profit).toBeLessThan(0);
  });
});

describe('soldUnitsMargin', () => {
  it('reads a partial sale above unit cost as a positive margin, with the rest as unsold cost', () => {
    // 10 units cost 1,000,000 (100k each); 4 sold for 600,000 net.
    const m = soldUnitsMargin({
      totalCost: 1_000_000,
      quantity: 10,
      quantitySold: 4,
      netRevenue: 600_000,
    });
    expect(m.soldCost).toBe(400_000);
    expect(m.margin).toBe(200_000);
    expect(m.unsoldCost).toBe(600_000);
  });

  it('caps sold units at the units produced', () => {
    const m = soldUnitsMargin({
      totalCost: 1_000_000,
      quantity: 10,
      quantitySold: 12,
      netRevenue: 1_500_000,
    });
    expect(m.soldCost).toBe(1_000_000);
    expect(m.unsoldCost).toBe(0);
  });

  it('is null-safe for a run of zero units', () => {
    const m = soldUnitsMargin({ totalCost: 0, quantity: 0, quantitySold: 0, netRevenue: 0 });
    expect(m).toEqual({ soldCost: 0, margin: 0, unsoldCost: 0 });
  });
});

describe('realizedProfit insurance', () => {
  const base = {
    materialCost: 8_000_000,
    jobFee: 1_000_000,
    quantitySold: 0,
    grossRevenue: 0,
    accountingLevel: 0,
    brokerFeeableRevenue: 0,
    brokerRelationsLevel: 0,
  };

  it('is unchanged without an insurance payout', () => {
    const r = realizedProfit(base);
    expect(r.insurance).toBe(0);
    expect(r.profit).toBe(-9_000_000);
  });

  it('adds the payout after fees, untaxed', () => {
    const r = realizedProfit({ ...base, insurancePayout: 1_500_000 });
    expect(r.insurance).toBe(1_500_000);
    expect(r.salesTax).toBe(0);
    expect(r.profit).toBe(-7_500_000);
  });
});

describe('runLoss', () => {
  it('writes off the lost units at the run cost per unit, net of insurance', () => {
    const r = runLoss({
      totalCost: 9_000_000,
      quantity: 12,
      quantityLost: 5,
      insurancePayout: 1_500_000,
    });
    expect(r.writtenOffCost).toBe(3_750_000);
    expect(r.insurance).toBe(1_500_000);
    expect(r.netLoss).toBe(2_250_000);
  });

  it('handles no insurance', () => {
    const r = runLoss({ totalCost: 9_000_000, quantity: 12, quantityLost: 12, insurancePayout: 0 });
    expect(r.netLoss).toBe(9_000_000);
  });

  it('caps the lost units at the run quantity and handles an empty run', () => {
    expect(
      runLoss({ totalCost: 100, quantity: 2, quantityLost: 9, insurancePayout: 0 }).writtenOffCost
    ).toBe(100);
    expect(
      runLoss({ totalCost: 100, quantity: 0, quantityLost: 1, insurancePayout: 0 }).writtenOffCost
    ).toBe(0);
  });
});

describe('validateLossQuantity', () => {
  it('accepts up to the unaccounted units', () => {
    expect(
      validateLossQuantity({ quantity: 12, quantitySold: 4, otherLost: 3, quantityLost: 5 })
    ).toBeNull();
  });
  it('rejects zero, fractions and more than remain', () => {
    const args = { quantity: 12, quantitySold: 4, otherLost: 3 };
    expect(validateLossQuantity({ ...args, quantityLost: 0 })).toBe('invalid');
    expect(validateLossQuantity({ ...args, quantityLost: 1.5 })).toBe('invalid');
    expect(validateLossQuantity({ ...args, quantityLost: 6 })).toBe('too-many');
  });
});

describe('soldUnitsMargin with losses', () => {
  it('removes the lost units cost from unsold cost', () => {
    const r = soldUnitsMargin({
      totalCost: 9_000_000,
      quantity: 12,
      quantitySold: 4,
      netRevenue: 4_000_000,
      quantityLost: 5,
    });
    expect(r.soldCost).toBe(3_000_000);
    expect(r.unsoldCost).toBe(9_000_000 - 3_000_000 - 3_750_000);
  });
});
