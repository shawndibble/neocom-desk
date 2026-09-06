import { describe, it, expect } from 'vitest';
import { orderFloor } from './orderFloor';
import { breakEvenPrice, salesTaxPct } from '@/engine/industry/fees';

describe('orderFloor', () => {
  it('relist matches breakEvenPrice at quantity 1 with the same fee inputs', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({ unitCost, accountingLevel, brokerRelationsLevel });
    const expectedRelist = breakEvenPrice(unitCost, 1, accountingLevel, brokerRelationsLevel);
    expect(result?.relist).toBeCloseTo(expectedRelist as number, 6);
  });

  it('fill is sales-tax-only: revenue such that revenue * (1 - tax/100) === unitCost', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({ unitCost, accountingLevel, brokerRelationsLevel });
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
    });
    expect(result).not.toBeNull();
    expect(result!.relist).toBeGreaterThan(2_200_000);
    expect(result!.relist).toBeLessThan(2_300_000);
    expect(result!.fill).toBeGreaterThan(2_200_000);
    expect(result!.fill).toBeLessThan(2_260_000);
  });

  it('fill is always <= relist (broker fee makes relist strictly pricier)', () => {
    const result = orderFloor({
      unitCost: 2_154_300,
      accountingLevel: 5,
      brokerRelationsLevel: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.fill).toBeLessThanOrEqual(result!.relist);
  });

  it('applies faction and corp standing reductions to relist via fees.ts, not re-derived here', () => {
    const base = orderFloor({ unitCost: 1_000_000, accountingLevel: 0, brokerRelationsLevel: 0 });
    const withStandings = orderFloor({
      unitCost: 1_000_000,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
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
    const result = orderFloor({ unitCost: 500_000, accountingLevel: 0, brokerRelationsLevel: 0 });
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.relist)).toBe(true);
    expect(Number.isFinite(result!.fill)).toBe(true);
  });

  it('returns null for a zero unitCost', () => {
    expect(orderFloor({ unitCost: 0, accountingLevel: 5, brokerRelationsLevel: 5 })).toBeNull();
  });

  it('returns null for a negative unitCost', () => {
    expect(orderFloor({ unitCost: -100, accountingLevel: 5, brokerRelationsLevel: 5 })).toBeNull();
  });

  it('returns null for a non-finite unitCost', () => {
    expect(
      orderFloor({
        unitCost: Number.POSITIVE_INFINITY,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
    expect(orderFloor({ unitCost: NaN, accountingLevel: 5, brokerRelationsLevel: 5 })).toBeNull();
  });
});
