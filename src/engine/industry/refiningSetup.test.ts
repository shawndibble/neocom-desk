import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFINING_SETUP,
  netOfReprocessingTax,
  reprocessingTaxOn,
  resolveRefiningSetup,
} from './refiningSetup';

describe('resolveRefiningSetup', () => {
  it('reads an unset setup as an NPC station at 50% with no tax', () => {
    expect(resolveRefiningSetup({ yieldRate: 0, taxRate: 0 })).toEqual(DEFAULT_REFINING_SETUP);
    expect(DEFAULT_REFINING_SETUP).toEqual({ stationRate: 0.5, taxRate: 0 });
  });

  it('uses a typed facility yield and tax', () => {
    expect(resolveRefiningSetup({ yieldRate: 0.54, taxRate: 0.01 })).toEqual({
      stationRate: 0.54,
      taxRate: 0.01,
    });
  });

  it('never lets a bad tax go negative or past 100%', () => {
    expect(resolveRefiningSetup({ yieldRate: 0.5, taxRate: -0.2 }).taxRate).toBe(0);
    expect(resolveRefiningSetup({ yieldRate: 0.5, taxRate: 3 }).taxRate).toBe(1);
  });

  it('falls back to the base yield for a non-finite or non-positive one', () => {
    expect(resolveRefiningSetup({ yieldRate: Number.NaN, taxRate: 0 }).stationRate).toBe(0.5);
    expect(resolveRefiningSetup({ yieldRate: -1, taxRate: 0 }).stationRate).toBe(0.5);
  });
});

describe('reprocessingTaxOn', () => {
  it('charges the rate on the priced minerals', () => {
    expect(reprocessingTaxOn({ 34: 1000, 35: 100 }, { 34: 5, 35: 10 }, 0.02)).toBeCloseTo(120, 6);
  });

  it('leaves an unpriced mineral out', () => {
    expect(reprocessingTaxOn({ 34: 1000, 36: 5 }, { 34: 5 }, 0.1)).toBeCloseTo(500, 6);
  });
});

describe('netOfReprocessingTax', () => {
  it('takes the tax off the value as an ISK fee', () => {
    expect(netOfReprocessingTax(1_000_000, 0.05)).toBe(950_000);
  });

  it('is the value unchanged at no tax', () => {
    expect(netOfReprocessingTax(1_234, 0)).toBe(1_234);
  });
});
