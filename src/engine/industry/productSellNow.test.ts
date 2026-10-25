import { describe, expect, it } from 'vitest';
import { productSellNow } from './productSellNow';
import { SKILL_IDS } from './types';

const PRODUCT = 587;

describe('productSellNow', () => {
  it('prices the product at the highest buy order, sales tax only, minus total cost', () => {
    // Accounting 0: 7.5% sales tax. No broker fee: filling a buy order lists nothing.
    const sale = productSellNow({
      productTypeID: PRODUCT,
      productQuantity: 10,
      hubBuyPrices: { [PRODUCT]: 1_000 },
      skills: {},
      totalCost: 5_000,
    });
    expect(sale).toEqual({
      unitPrice: 1_000,
      quantity: 10,
      gross: 10_000,
      salesTax: 750,
      net: 9_250,
      forgone: 0,
      profit: 4_250,
    });
  });

  it('applies Accounting to the sales tax', () => {
    const sale = productSellNow({
      productTypeID: PRODUCT,
      productQuantity: 1,
      hubBuyPrices: { [PRODUCT]: 1_000_000 },
      skills: { [SKILL_IDS.accounting]: 5 },
      totalCost: 0,
    });
    // 7.5% × (1 − 0.11 × 5) = 3.375%
    expect(sale?.salesTax).toBeCloseTo(33_750);
    expect(sale?.profit).toBeCloseTo(966_250);
  });

  it('charges the forgone owned-material sale on the sell-value basis', () => {
    const sale = productSellNow({
      productTypeID: PRODUCT,
      productQuantity: 10,
      hubBuyPrices: { [PRODUCT]: 1_000 },
      skills: {},
      totalCost: 5_000,
      forgone: 1_000,
    });
    expect(sale?.forgone).toBe(1_000);
    expect(sale?.profit).toBe(3_250);
  });

  it('is null when the hub has no buy order for the product', () => {
    expect(
      productSellNow({
        productTypeID: PRODUCT,
        productQuantity: 10,
        hubBuyPrices: {},
        skills: {},
        totalCost: 5_000,
      })
    ).toBeNull();
  });

  it('is null when the job yields nothing', () => {
    expect(
      productSellNow({
        productTypeID: PRODUCT,
        productQuantity: 0,
        hubBuyPrices: { [PRODUCT]: 1_000 },
        skills: {},
        totalCost: 5_000,
      })
    ).toBeNull();
  });
});
