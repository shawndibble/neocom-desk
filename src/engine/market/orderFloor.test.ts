import { describe, it, expect } from 'vitest';
import { orderFloor } from './orderFloor';
import { breakEvenPrice, salesTaxPct } from '@/engine/industry/fees';

describe('orderFloor', () => {
  it('relist matches breakEvenPrice at quantity 1 with the same fee inputs', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      remainingQuantity: 1,
      accountingLevel,
      brokerRelationsLevel,
    });
    const expectedRelist = breakEvenPrice(unitCost, 1, accountingLevel, brokerRelationsLevel);
    expect(result?.relist).toBeCloseTo(expectedRelist as number, 6);
  });

  it('fill is sales-tax-only: revenue such that revenue * (1 - tax/100) === unitCost', () => {
    const unitCost = 2_154_300;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      remainingQuantity: 1,
      accountingLevel,
      brokerRelationsLevel,
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
      remainingQuantity: 1,
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
      remainingQuantity: 1,
      accountingLevel: 5,
      brokerRelationsLevel: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.fill).toBeLessThanOrEqual(result!.relist);
  });

  it('applies faction and corp standing reductions to relist via fees.ts, not re-derived here', () => {
    const base = orderFloor({
      unitCost: 1_000_000,
      remainingQuantity: 1,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
    });
    const withStandings = orderFloor({
      unitCost: 1_000_000,
      remainingQuantity: 1,
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
    const result = orderFloor({
      unitCost: 500_000,
      remainingQuantity: 1,
      accountingLevel: 0,
      brokerRelationsLevel: 0,
    });
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.relist)).toBe(true);
    expect(Number.isFinite(result!.fill)).toBe(true);
  });

  it('returns null for a zero unitCost', () => {
    expect(
      orderFloor({ unitCost: 0, remainingQuantity: 1, accountingLevel: 5, brokerRelationsLevel: 5 })
    ).toBeNull();
  });

  it('returns null for a negative unitCost', () => {
    expect(
      orderFloor({
        unitCost: -100,
        remainingQuantity: 1,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
  });

  it('returns null for a non-finite unitCost', () => {
    expect(
      orderFloor({
        unitCost: Number.POSITIVE_INFINITY,
        remainingQuantity: 1,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
    expect(
      orderFloor({
        unitCost: NaN,
        remainingQuantity: 1,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
  });

  it('returns null for a zero or negative remainingQuantity', () => {
    expect(
      orderFloor({
        unitCost: 500_000,
        remainingQuantity: 0,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
    expect(
      orderFloor({
        unitCost: 500_000,
        remainingQuantity: -5,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
      })
    ).toBeNull();
  });

  it('re-solves the 100 ISK minimum broker fee once against the whole remaining stack, not per unit', () => {
    // A cheap item where 3% of a single unit's value is nowhere near 100 ISK,
    // but the stack of 10,000 units easily clears it via the percentage fee.
    const unitCost = 10;
    const remainingQuantity = 10_000;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      remainingQuantity,
      accountingLevel,
      brokerRelationsLevel,
    });
    const expectedRelist = breakEvenPrice(
      unitCost * remainingQuantity,
      remainingQuantity,
      accountingLevel,
      brokerRelationsLevel
    );
    expect(result?.relist).toBeCloseTo(expectedRelist as number, 6);
    // The bug this pins: charging the 100 ISK minimum per unit would inflate
    // relist to roughly unitCost + tax + 100. The correct per-stack minimum
    // spreads 100 ISK across all 10,000 units, landing just above unitCost.
    expect(result!.relist).toBeLessThan(unitCost + 5);
  });

  it('spreads the 100 ISK minimum across a stack whose percentage fee alone would still fall short of it', () => {
    // Percentage fee on the whole 100-unit stack (~15.77 ISK) is still under
    // the 100 ISK minimum, so the minimum applies once and is spread across
    // all 100 units — not the qty-1 case, and not a stack large enough to
    // clear the minimum on percentage fee alone.
    const unitCost = 10;
    const remainingQuantity = 100;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const result = orderFloor({
      unitCost,
      remainingQuantity,
      accountingLevel,
      brokerRelationsLevel,
    });
    const expectedRelist = breakEvenPrice(
      unitCost * remainingQuantity,
      remainingQuantity,
      accountingLevel,
      brokerRelationsLevel
    );
    expect(result?.relist).toBeCloseTo(expectedRelist as number, 6);
    expect(result!.relist).toBeCloseTo(11.3842, 3);
  });

  it('below the broker-fee minimum, a single unit relist floor is far higher than a large stack', () => {
    const unitCost = 10;
    const accountingLevel = 5;
    const brokerRelationsLevel = 5;
    const singleUnit = orderFloor({
      unitCost,
      remainingQuantity: 1,
      accountingLevel,
      brokerRelationsLevel,
    });
    const bigStack = orderFloor({
      unitCost,
      remainingQuantity: 10_000,
      accountingLevel,
      brokerRelationsLevel,
    });
    expect(singleUnit).not.toBeNull();
    expect(bigStack).not.toBeNull();
    // Single unit still eats the full 100 ISK minimum; a 10,000-unit stack
    // spreads that same 100 ISK to a fraction of an ISK per unit.
    expect(singleUnit!.relist).toBeGreaterThan(100);
    expect(bigStack!.relist).toBeLessThan(unitCost + 5);
  });
});
