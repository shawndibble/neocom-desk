import { describe, expect, it } from 'vitest';
import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import { orderFees, type OrderFeeContext } from './orderFees';

const ctx: OrderFeeContext = {
  accountingLevel: 5,
  brokerRelationsLevel: 4,
  standing: { factionStanding: 2, corpStanding: 1 },
};
const pct = (p: number) => p / 100;

describe('orderFees', () => {
  it('charges sales tax only when you sell into a buy order, and pays out the rest', () => {
    const { fees, finalPrice } = orderFees({ price: 1_000, is_buy_order: true }, ctx);
    expect(fees).toBeCloseTo(1_000 * pct(salesTaxPct(5)), 9);
    expect(finalPrice).toBeCloseTo(1_000 - fees, 9);
  });

  it('adds a hub’s broker surcharge to a listed price but not to a buy order', () => {
    const surcharged: OrderFeeContext = {
      ...ctx,
      standing: { ...ctx.standing, brokerSurchargePct: 5 },
    };
    const sell = orderFees({ price: 1_000, is_buy_order: false }, surcharged);
    const plain = orderFees({ price: 1_000, is_buy_order: false }, ctx);
    expect(sell.fees - plain.fees).toBeCloseTo(1_000 * pct(5), 9);
    expect(orderFees({ price: 1_000, is_buy_order: true }, surcharged).fees).toBeCloseTo(
      orderFees({ price: 1_000, is_buy_order: true }, ctx).fees,
      9
    );
  });

  it('charges the broker fee and sales tax when you list at a sell order’s price', () => {
    const { fees, finalPrice } = orderFees({ price: 1_000, is_buy_order: false }, ctx);
    const expected = 1_000 * (pct(salesTaxPct(5)) + pct(brokerFeePct(4, 2, 1)));
    expect(fees).toBeCloseTo(expected, 9);
    expect(finalPrice).toBeCloseTo(1_000 - expected, 9);
  });

  it('charges less with better Broker Relations and standing', () => {
    const order = { price: 1_000, is_buy_order: false };
    const worse = orderFees(order, {
      ...ctx,
      brokerRelationsLevel: 0,
      standing: { factionStanding: 0, corpStanding: 0 },
    });
    expect(orderFees(order, ctx).fees).toBeLessThan(worse.fees);
  });
});
