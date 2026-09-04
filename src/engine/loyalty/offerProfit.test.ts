import { describe, it, expect } from 'vitest';
import { loyaltyOfferProfit, rankByIskPerLp } from '@/engine/loyalty/offerProfit';
import type { LoyaltyOfferProfitInput } from '@/engine/loyalty/offerProfit';

describe('loyaltyOfferProfit', () => {
  it('prices a simple (non-blueprint) offer: revenue minus ISK cost and required items', () => {
    const input: LoyaltyOfferProfitInput = {
      iskCost: 96_000,
      lpCost: 4_800,
      requiredItemsCost: 0,
      revenue: 8 * 1_800, // 8 probes at 1,800 ISK each
      buildCost: 0,
      playerLp: 620_000,
    };

    const result = loyaltyOfferProfit(input);

    expect(result.revenue).toBe(14_400);
    expect(result.profit).toBe(14_400 - 96_000);
    expect(result.iskPerLp).toBeCloseTo((14_400 - 96_000) / 4_800, 6);
    expect(result.affordableLp).toBe(true);
  });

  it('nets a blueprint offer against the manufacturing build cost, not just the ISK sticker price', () => {
    // Astero BPC: LP+ISK buys the copy; building it still costs materials + job fee.
    const input: LoyaltyOfferProfitInput = {
      iskCost: 12_000_000,
      lpCost: 950_000,
      requiredItemsCost: 0,
      revenue: 26_000_000,
      buildCost: 8_500_000,
      playerLp: 620_000,
    };

    const result = loyaltyOfferProfit(input);

    expect(result.profit).toBe(26_000_000 - 12_000_000 - 8_500_000);
    expect(result.iskPerLp).toBeCloseTo(5_500_000 / 950_000, 6);
  });

  it('folds in required-items cost when the offer demands a turn-in item', () => {
    const input: LoyaltyOfferProfitInput = {
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: 2_500,
      revenue: 20_000,
      buildCost: 0,
      playerLp: 1_000,
    };

    const result = loyaltyOfferProfit(input);

    expect(result.profit).toBe(20_000 - 10_000 - 2_500);
  });

  it('is unpriceable when revenue is unknown (no hub price for the item)', () => {
    const input: LoyaltyOfferProfitInput = {
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: 0,
      revenue: null,
      buildCost: 0,
      playerLp: 1_000,
    };

    const result = loyaltyOfferProfit(input);

    expect(result.profit).toBeNull();
    expect(result.iskPerLp).toBeNull();
  });

  it('is unpriceable when a required item has no hub price, even though the product does', () => {
    const input: LoyaltyOfferProfitInput = {
      iskCost: 10_000,
      lpCost: 1_000,
      requiredItemsCost: null,
      revenue: 20_000,
      buildCost: 0,
      playerLp: 1_000,
    };

    const result = loyaltyOfferProfit(input);

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
