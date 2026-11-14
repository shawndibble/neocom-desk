import { describe, it, expect } from 'vitest';
import { brokerFee } from '@/engine/industry/fees';
import { SKILL_IDS } from '@/engine/industry/types';
import { buyOrderFeePct, buyOrderMaterialPrices } from '@/engine/industry/buyOrderPrices';

describe('buyOrderFeePct', () => {
  it('is the NPC broker rate from Broker Relations alone at zero standing', () => {
    expect(buyOrderFeePct({ [SKILL_IDS.brokerRelations]: 5 })).toBeCloseTo(1.5);
    expect(buyOrderFeePct({})).toBeCloseTo(3);
  });

  it('follows standings and adds a hub Safety Tax, as the product-side fee does', () => {
    const skills = { [SKILL_IDS.brokerRelations]: 4 };
    const standing = { factionStanding: 2, corpStanding: 1, safetyTaxPct: 5 };
    const value = 1_000_000;
    expect((value * buyOrderFeePct(skills, standing)) / 100).toBeCloseTo(
      brokerFee(value, 4, 2, 1, 5)
    );
  });
});

describe('buyOrderMaterialPrices', () => {
  it('adds the placement fee to each buy-order price', () => {
    const prices = buyOrderMaterialPrices({ 34: 100, 35: 10 }, 1.5);
    expect(prices[34]).toBeCloseTo(101.5);
    expect(prices[35]).toBeCloseTo(10.15);
  });

  it('keeps a material with no buy order unpriced', () => {
    const prices = buyOrderMaterialPrices({ 34: 100 }, 1.5);
    expect(prices[36]).toBeUndefined();
    expect(Object.keys(prices)).toEqual(['34']);
  });

  it('returns the same map at a zero rate', () => {
    const prices = { 34: 100 };
    expect(buyOrderMaterialPrices(prices, 0)).toBe(prices);
  });
});
