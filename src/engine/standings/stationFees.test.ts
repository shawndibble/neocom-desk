import { describe, it, expect } from 'vitest';
import { brokerFeePct } from '@/engine/industry/fees';
import { brokerFeeComparison, reprocessingTaxPct } from './stationFees';

describe('reprocessingTaxPct', () => {
  it.each([
    // [take %, standing, expected %]
    [5, 0, 5],
    [5, 1, 4.25],
    [5, 5, 1.25],
    [5, 6, 0.5],
    [5, 20 / 3, 0],
    [5, 6.67, 0], // 0.15 * 6.67 passes 1: floored, never negative
    [5, 8, 0],
    [5, 10, 0],
    [2.5, 0, 2.5],
    [2.5, 5, 0.625],
    [2.5, 7, 0],
    [0, 3, 0],
  ])('take %s%% at standing %s -> %s%%', (take, standing, expected) => {
    expect(reprocessingTaxPct(take, standing)).toBeCloseTo(expected, 10);
  });

  it('never goes above the station take for a negative standing (no surcharge is documented)', () => {
    expect(reprocessingTaxPct(5, -4)).toBe(5);
    expect(reprocessingTaxPct(2.5, -10)).toBe(2.5);
  });

  it('reaches zero at 6.67', () => {
    expect(reprocessingTaxPct(5, 6.67)).toBeCloseTo(0, 2);
    expect(reprocessingTaxPct(5, 6.6667)).toBeCloseTo(0, 3);
  });
});

describe('brokerFeeComparison', () => {
  it('compares zero standing with yours using brokerFeePct', () => {
    const result = brokerFeeComparison(4, 5, 3);
    expect(result.atZeroPct).toBe(brokerFeePct(4, 0, 0));
    expect(result.atYoursPct).toBe(brokerFeePct(4, 5, 3));
    expect(result.savingPct).toBeCloseTo(5 * 0.03 + 3 * 0.02, 10);
  });

  it('saves nothing at zero standing', () => {
    expect(brokerFeeComparison(5, 0, 0).savingPct).toBe(0);
  });

  it('costs more (negative saving) at negative standing', () => {
    expect(brokerFeeComparison(0, -2, -2).savingPct).toBeCloseTo(-0.1, 10);
  });

  it('floors the fee at 0 like brokerFeePct', () => {
    expect(brokerFeeComparison(5, 10, 10)).toMatchObject({ atZeroPct: 1.5, atYoursPct: 1 });
  });
});
