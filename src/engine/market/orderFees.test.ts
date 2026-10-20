import { describe, expect, it } from 'vitest';
import { salesTaxPct } from '@/engine/industry/fees';
import { orderFees } from './orderFees';

describe('orderFees', () => {
  it('charges sales tax when you sell into a buy order, and pays out the rest', () => {
    const { fees, finalPrice } = orderFees({ price: 1_000, is_buy_order: true }, 5);
    expect(fees).toBeCloseTo((1_000 * salesTaxPct(5)) / 100, 9);
    expect(finalPrice).toBeCloseTo(1_000 - fees, 9);
  });

  it('charges nothing when you buy from a sell order outright', () => {
    expect(orderFees({ price: 1_000, is_buy_order: false }, 0)).toEqual({
      fees: 0,
      finalPrice: 1_000,
    });
  });

  it('taxes less at a higher Accounting level', () => {
    const low = orderFees({ price: 1_000, is_buy_order: true }, 0).fees;
    const high = orderFees({ price: 1_000, is_buy_order: true }, 5).fees;
    expect(high).toBeLessThan(low);
  });
});
