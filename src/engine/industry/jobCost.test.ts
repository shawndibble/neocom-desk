import { describe, it, expect } from 'vitest';
import { estimatedItemValue, jobFee } from '@/engine/industry/jobCost';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';

const bp: IndustryBlueprint = {
  name: 'Test Item',
  time: 600,
  materials: [
    { typeID: 34, quantity: 1000 },
    { typeID: 35, quantity: 200 },
  ],
  products: [{ typeID: 999, quantity: 1 }],
};

describe('estimatedItemValue', () => {
  it('sums base (ME0) quantities times adjusted prices, times runs', () => {
    const prices = { 34: 4, 35: 10 };
    // (1000*4 + 200*10) = 6000 per run
    expect(estimatedItemValue(bp, 1, prices)).toBe(6000);
    expect(estimatedItemValue(bp, 5, prices)).toBe(30000);
  });

  it('treats missing or zero adjusted prices as zero', () => {
    expect(estimatedItemValue(bp, 1, { 34: 4 })).toBe(4000);
    expect(estimatedItemValue(bp, 1, { 34: 0, 35: 0 })).toBe(0);
  });
});

describe('jobFee', () => {
  it('computes NPC station fee: EIV * (SCI + tax + SCC)', () => {
    // gross = 1e6 * 0.05 = 50_000; scc = 1e6 * 4% = 40_000; tax = 1e6 * 0.25% = 2_500
    const fee = jobFee(1_000_000, 0.05, FACILITY_PRESETS.npcStation);
    expect(fee.eiv).toBe(1_000_000);
    expect(fee.grossCost).toBeCloseTo(50_000, 6);
    expect(fee.sccSurcharge).toBeCloseTo(40_000, 6);
    expect(fee.facilityTax).toBeCloseTo(2_500, 6);
    expect(fee.total).toBeCloseTo(92_500, 6);
  });

  it('applies the structure job-cost bonus to the cost-index term only', () => {
    // Raitaru 3%: gross = 1e6 * 0.05 * 0.97 = 48_500; scc still 40_000; tax 1% = 10_000
    const fee = jobFee(1_000_000, 0.05, FACILITY_PRESETS.raitaru, 1);
    expect(fee.grossCost).toBeCloseTo(48_500, 6);
    expect(fee.sccSurcharge).toBeCloseTo(40_000, 6);
    expect(fee.facilityTax).toBeCloseTo(10_000, 6);
    expect(fee.total).toBeCloseTo(98_500, 6);
  });

  it('uses the preset default tax when none is given', () => {
    const fee = jobFee(1_000_000, 0.05, FACILITY_PRESETS.sotiyo);
    // Sotiyo 5% bonus, default structure tax 0%
    expect(fee.grossCost).toBeCloseTo(47_500, 6);
    expect(fee.facilityTax).toBe(0);
    expect(fee.total).toBeCloseTo(87_500, 6);
  });

  it('handles zero EIV', () => {
    const fee = jobFee(0, 0.05, FACILITY_PRESETS.npcStation);
    expect(fee.total).toBe(0);
  });

  it('rejects negative inputs', () => {
    expect(() => jobFee(-1, 0.05, FACILITY_PRESETS.npcStation)).toThrow(RangeError);
    expect(() => jobFee(1, -0.05, FACILITY_PRESETS.npcStation)).toThrow(RangeError);
  });
});
