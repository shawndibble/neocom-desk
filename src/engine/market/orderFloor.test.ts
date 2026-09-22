import { describe, it, expect } from 'vitest';
import { orderFloor } from './orderFloor';
import { relistBreakEvenPrice, breakEvenPrice, salesTaxPct } from '@/engine/industry/fees';

describe('orderFloor', () => {
  it('relist matches relistBreakEvenPrice at quantity 1 with the same fee inputs', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const advancedBrokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      accountingLevel,
      brokerRelationsLevel,
      advancedBrokerRelationsLevel,
    });
    const expectedRelist = relistBreakEvenPrice(
      unitCost,
      1,
      accountingLevel,
      brokerRelationsLevel,
      advancedBrokerRelationsLevel
    );
    expect(result?.relist).toBeCloseTo(expectedRelist as number, 6);
  });

  it('relist is lower than a fresh-listing break-even, since relisting is Relist-Discounted', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      accountingLevel,
      brokerRelationsLevel,
      advancedBrokerRelationsLevel: 0,
    });
    const freshListing = breakEvenPrice(unitCost, 1, accountingLevel, brokerRelationsLevel);
    expect(result).not.toBeNull();
    expect(result!.relist).toBeLessThan(freshListing as number);
  });

  it('a character without Advanced Broker Relations still gets the 50% base Relist Discount', () => {
    const withoutSkill = orderFloor({
      unitCost: 1_000_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
      advancedBrokerRelationsLevel: 0,
    });
    const withSkill = orderFloor({
      unitCost: 1_000_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
      advancedBrokerRelationsLevel: 5,
    });
    expect(withoutSkill).not.toBeNull();
    expect(withSkill).not.toBeNull();
    // Both get the base discount; higher skill level narrows the gap further.
    expect(withSkill!.relist).toBeLessThan(withoutSkill!.relist);
    expect(withoutSkill!.relist).toBeLessThan(breakEvenPrice(1_000_000, 1, 0, 0) as number);
  });

  it('fill is sales-tax-only: revenue such that revenue * (1 - tax/100) === unitCost', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      accountingLevel,
      brokerRelationsLevel,
      advancedBrokerRelationsLevel: 5,
    });
    const tax = salesTaxPct(accountingLevel);
    const expectedFill = unitCost / (1 - tax / 100);
    expect(result?.fill).toBeCloseTo(expectedFill, 6);
    // sanity: filling at `fill` and paying sales tax nets exactly unitCost
    expect(result!.fill * (1 - tax / 100)).toBeCloseTo(unitCost, 6);
  });

  it('produces the documented approximate figures for Accounting V / Broker Relations V', () => {
    const result = orderFloor({
      unitCost: 2_154_300,
      accountingLevel: 5,
      brokerRelationsLevel: 5,
      advancedBrokerRelationsLevel: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.relist).toBeGreaterThan(2_200_000);
    expect(result!.relist).toBeLessThan(2_260_000);
    expect(result!.fill).toBeGreaterThan(2_200_000);
    expect(result!.fill).toBeLessThan(2_260_000);
  });

  it('fill is always <= relist (broker fee makes relist strictly pricier)', () => {
    const result = orderFloor({
      unitCost: 2_154_300,
      accountingLevel: 5,
      brokerRelationsLevel: 5,
      advancedBrokerRelationsLevel: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.fill).toBeLessThanOrEqual(result!.relist);
  });

  it('applies faction and corp standing reductions to relist via fees.ts, not re-derived here', () => {
    const base = orderFloor({
      unitCost: 1_000_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
      advancedBrokerRelationsLevel: 0,
    });
    const withStandings = orderFloor({
      unitCost: 1_000_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
      advancedBrokerRelationsLevel: 0,
      factionStanding: 10,
      corpStanding: 10,
    });
    expect(base).not.toBeNull();
    expect(withStandings).not.toBeNull();
    expect(withStandings!.relist).toBeLessThan(base!.relist);
    // fill has no broker fee, so standings do not move it
    expect(withStandings!.fill).toBeCloseTo(base!.fill, 6);
  });

  it('both figures are finite for a zero-standing, zero-skill character', () => {
    const result = orderFloor({
      unitCost: 500_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
      advancedBrokerRelationsLevel: 0,
    });
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.relist)).toBe(true);
    expect(Number.isFinite(result!.fill)).toBe(true);
  });

  it('returns null for a zero unitCost', () => {
    expect(
      orderFloor({
        unitCost: 0,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
      })
    ).toBeNull();
  });

  it('returns null for a negative unitCost', () => {
    expect(
      orderFloor({
        unitCost: -100,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
      })
    ).toBeNull();
  });

  it('returns null for a non-finite unitCost', () => {
    expect(
      orderFloor({
        unitCost: Number.POSITIVE_INFINITY,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
      })
    ).toBeNull();
    expect(
      orderFloor({
        unitCost: NaN,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 5,
      })
    ).toBeNull();
  });
});
