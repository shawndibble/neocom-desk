import { describe, it, expect } from 'vitest';
import { loyaltyOfferProfit, rankByIskPerLp } from '@/engine/loyalty/offerProfit';
import type { LoyaltyOfferProfitInput } from '@/engine/loyalty/offerProfit';
import { brokerFee, salesTax } from '@/engine/industry/fees';
import { SKILL_IDS } from '@/engine/industry/types';

const MAX_SKILLS = { [SKILL_IDS.accounting]: 5, [SKILL_IDS.brokerRelations]: 5 };
const NO_SKILLS = {};

describe('loyaltyOfferProfit', () => {
  it('prices a simple (non-blueprint) offer: revenue net of market fees, minus ISK cost and required items', () => {
    const revenue = 8 * 1_800; // 8 probes at 1,800 ISK each
    const input: LoyaltyOfferProfitInput = {
      iskCost: 96_000,
      lpCost: 4_800,
      requiredItemsCost: 0,
      revenue,
      buildCost: 0,
      playerLp: 620_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    };

    const result = loyaltyOfferProfit(input);

    const tax = salesTax(revenue, 5);
    const broker = brokerFee(revenue, 5);
    expect(result.revenue).toBe(14_400);
    expect(result.salesTax).toBeCloseTo(tax, 6);
    expect(result.brokerFee).toBeCloseTo(broker, 6);
    expect(result.netRevenue).toBeCloseTo(revenue - tax - broker, 6);
    expect(result.profit).toBeCloseTo(revenue - tax - broker - 96_000, 6);
    expect(result.iskPerLp).toBeCloseTo((revenue - tax - broker - 96_000) / 4_800, 6);
    expect(result.affordableLp).toBe(true);
  });

  it('nets a blueprint offer against the manufacturing build cost, not just the ISK sticker price', () => {
    // Astero BPC: LP+ISK buys the copy; building it still costs materials + job fee.
    const revenue = 26_000_000;
    const input: LoyaltyOfferProfitInput = {
      iskCost: 12_000_000,
      lpCost: 950_000,
      requiredItemsCost: 0,
      revenue,
      buildCost: 8_500_000,
      playerLp: 620_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    };

    const result = loyaltyOfferProfit(input);

    const net = revenue - salesTax(revenue, 5) - brokerFee(revenue, 5);
    expect(result.profit).toBeCloseTo(net - 12_000_000 - 8_500_000, 6);
    expect(result.iskPerLp).toBeCloseTo((net - 12_000_000 - 8_500_000) / 950_000, 6);
  });

  it('folds in required-items cost when the offer demands a turn-in item', () => {
    const revenue = 20_000;
    const result = loyaltyOfferProfit({
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: 2_500,
      revenue,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    const net = revenue - salesTax(revenue, 5) - brokerFee(revenue, 5);
    expect(result.profit).toBeCloseTo(net - 10_000 - 2_500, 6);
  });

  it('charges sales tax on both bases and the broker fee only when listing an order', () => {
    const revenue = 20_000_000;
    const base = {
      iskCost: 0,
      lpCost: 1_000,
      requiredItemsCost: 0,
      revenue,
      buildCost: 0,
      playerLp: 1_000,
      skills: MAX_SKILLS,
    };

    const order = loyaltyOfferProfit({ ...base, liquidationBasis: 'order' });
    const instant = loyaltyOfferProfit({ ...base, liquidationBasis: 'instant' });

    // Same sales tax either way — the fee that differs is the broker fee.
    expect(instant.salesTax).toBeCloseTo(order.salesTax ?? 0, 6);
    expect(instant.salesTax).toBeCloseTo(salesTax(revenue, 5), 6);
    expect(instant.brokerFee).toBe(0);
    expect(order.brokerFee).toBeCloseTo(brokerFee(revenue, 5), 6);
    expect(order.profit).toBeLessThan(instant.profit ?? 0);
  });

  it('reads Accounting and Broker Relations from the skills map, defaulting untrained to 0', () => {
    const revenue = 10_000_000;
    const base = {
      iskCost: 0,
      lpCost: 1_000,
      requiredItemsCost: 0,
      revenue,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order' as const,
    };

    const trained = loyaltyOfferProfit({ ...base, skills: MAX_SKILLS });
    const untrained = loyaltyOfferProfit({ ...base, skills: NO_SKILLS });

    expect(untrained.salesTax).toBeCloseTo(salesTax(revenue, 0), 6);
    expect(untrained.brokerFee).toBeCloseTo(brokerFee(revenue, 0), 6);
    expect(untrained.profit).toBeLessThan(trained.profit ?? 0);
  });

  it('charges the 100 ISK broker-fee floor once per redemption, even on a cheap high-volume offer', () => {
    // 100 units of a 20 ISK trash item: 2,000 ISK of revenue. The percentage
    // broker fee would be ~30 ISK, so the 100 ISK per-order floor dominates —
    // and it bites once for the whole stack, not once per unit.
    const revenue = 100 * 20;
    const result = loyaltyOfferProfit({
      iskCost: 0,
      lpCost: 100,
      requiredItemsCost: 0,
      revenue,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    expect(result.brokerFee).toBe(100);
    expect(result.profit).toBeCloseTo(revenue - salesTax(revenue, 5) - 100, 6);
  });

  it('flips a thin-margin offer from profitable to loss-making once fees apply', () => {
    // Gross profit is +1,000 ISK; fees on 100,000 ISK of revenue exceed that.
    const revenue = 100_000;
    const result = loyaltyOfferProfit({
      iskCost: 99_000,
      lpCost: 1_000,
      requiredItemsCost: 0,
      revenue,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    expect(revenue - 99_000).toBeGreaterThan(0);
    expect(result.profit).toBeLessThan(0);
    expect(result.iskPerLp).toBeLessThan(0);
  });

  it('charges no broker fee at all on a zero-revenue offer', () => {
    const result = loyaltyOfferProfit({
      iskCost: 1_000,
      lpCost: 100,
      requiredItemsCost: 0,
      revenue: 0,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    expect(result.brokerFee).toBe(0);
    expect(result.salesTax).toBe(0);
    expect(result.profit).toBe(-1_000);
  });

  it('is unpriceable when revenue is unknown (no hub price for the item)', () => {
    const result = loyaltyOfferProfit({
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: 0,
      revenue: null,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    expect(result.profit).toBeNull();
    expect(result.iskPerLp).toBeNull();
    expect(result.salesTax).toBeNull();
    expect(result.brokerFee).toBeNull();
    expect(result.netRevenue).toBeNull();
  });

  it('is unpriceable when a required item has no hub price, even though the product does', () => {
    const result = loyaltyOfferProfit({
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: null,
      revenue: 20_000,
      buildCost: 0,
      playerLp: 1_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });

    expect(result.profit).toBeNull();
    expect(result.iskPerLp).toBeNull();
  });

  it('reports LP affordability independently of profitability', () => {
    const unaffordable = loyaltyOfferProfit({
      iskCost: 0,
      lpCost: 2_800_000,
      requiredItemsCost: 0,
      revenue: 1,
      buildCost: 0,
      playerLp: 620_000,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });
    expect(unaffordable.affordableLp).toBe(false);
    expect(unaffordable.profit).not.toBeNull();
  });

  it('never divides by zero LP cost', () => {
    const result = loyaltyOfferProfit({
      iskCost: 0,
      lpCost: 0,
      requiredItemsCost: 0,
      revenue: 100,
      buildCost: 0,
      playerLp: 0,
      liquidationBasis: 'order',
      skills: MAX_SKILLS,
    });
    expect(result.iskPerLp).toBeNull();
  });
});

describe('rankByIskPerLp', () => {
  it('sorts most profitable per LP first, sinking unpriceable (null) offers to the end', () => {
    const rows = [
      { id: 'low', profit: { iskPerLp: 2 } },
      { id: 'unpriced', profit: { iskPerLp: null } },
      { id: 'high', profit: { iskPerLp: 50 } },
      { id: 'negative', profit: { iskPerLp: -3 } },
    ];

    const sorted = rankByIskPerLp(rows, (r) => r.profit.iskPerLp).map((r) => r.id);

    expect(sorted).toEqual(['high', 'low', 'negative', 'unpriced']);
  });
});
