import { describe, it, expect } from 'vitest';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS, SKILL_IDS } from '@/engine/industry/types';
import type { IndustryBlueprint, IndustryInputs } from '@/engine/industry/types';

const bp: IndustryBlueprint = {
  name: 'Widget',
  time: 3600,
  materials: [
    { typeID: 34, quantity: 1000 },
    { typeID: 35, quantity: 34 },
  ],
  products: [{ typeID: 999, quantity: 1 }],
};

const baseInputs: IndustryInputs = {
  blueprint: bp,
  runs: 10,
  me: 10,
  te: 20,
  facility: FACILITY_PRESETS.raitaru,
  rig: 't1',
  security: 'highsec',
  facilityTaxPct: 1,
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 4, 35: 100 },
  hubPrices: { 34: 5, 35: 120, 999: 100_000 },
  skills: {
    [SKILL_IDS.industry]: 5,
    [SKILL_IDS.advancedIndustry]: 4,
    [SKILL_IDS.accounting]: 5,
    [SKILL_IDS.brokerRelations]: 5,
  },
};

describe('buildVsBuy', () => {
  it('computes the full hand-checked scenario', () => {
    const r = buildVsBuy(baseInputs);

    // modifier 0.9 * 0.99 * 0.98 = 0.87318, per-job over 10 runs
    expect(r.materials).toEqual([
      { typeID: 34, baseQuantity: 10_000, quantity: 8732 },
      { typeID: 35, baseQuantity: 340, quantity: 297 },
    ]);
    expect(r.materialCost).toBeCloseTo(8732 * 5 + 297 * 120, 6); // 79_300

    // 3600*10 * 0.8 (TE) * 0.8 (Ind V) * 0.88 (Adv IV) * 0.85 (Raitaru) * 0.8 (T1 rig)
    expect(r.seconds).toBeCloseTo(13_787.136, 6);

    // EIV = 10 * (1000*4 + 34*100) = 74_000
    expect(r.jobFee.eiv).toBe(74_000);
    expect(r.jobFee.grossCost).toBeCloseTo(74_000 * 0.05 * 0.97, 6); // 3_589
    expect(r.jobFee.sccSurcharge).toBeCloseTo(2_960, 6);
    expect(r.jobFee.facilityTax).toBeCloseTo(740, 6);
    expect(r.jobFee.total).toBeCloseTo(7_289, 6);

    expect(r.totalCost).toBeCloseTo(86_589, 6);

    // 10 units at 100k
    expect(r.buyCost).toBe(1_000_000);
    expect(r.revenue).toBe(1_000_000);
    expect(r.salesTax).toBeCloseTo(1_000_000 * 0.03375, 6);
    expect(r.brokerFee).toBeCloseTo(1_000_000 * 0.015, 6);

    const profit = 1_000_000 - 33_750 - 15_000 - 86_589;
    expect(r.profit).toBeCloseTo(profit, 6);
    expect(r.marginPct).toBeCloseTo((profit / 86_589) * 100, 6);
    expect(r.iskPerHour).toBeCloseTo(profit / (13_787.136 / 3600), 4);

    expect(r.unpriceable).toBe(false);
    expect(r.unpricedMaterials).toEqual([]);
    expect(r.recommendation).toBe('build');
  });

  it('recommends buy when building costs more than the hub sell price', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { ...baseInputs.hubPrices, 999: 8_000 } });
    // buyCost 80_000 < totalCost 86_589
    expect(r.recommendation).toBe('buy');
  });

  it('treats zero-price materials as priced, contributing zero cost', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { 34: 0, 35: 120, 999: 100_000 } });
    expect(r.unpriceable).toBe(false);
    expect(r.materialCost).toBeCloseTo(297 * 120, 6);
  });

  it('flags a material with no hub price instead of throwing', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { 34: 5, 999: 100_000 } });
    expect(r.unpriceable).toBe(true);
    expect(r.unpricedMaterials).toEqual([35]);
    // priced portion still reported; verdict withheld
    expect(r.materialCost).toBeCloseTo(8732 * 5, 6);
    expect(r.profit).toBeNull();
    expect(r.marginPct).toBeNull();
    expect(r.iskPerHour).toBeNull();
    expect(r.recommendation).toBe('unknown');
  });

  it('flags a product with no hub price instead of throwing', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { 34: 5, 35: 120 } });
    expect(r.unpriceable).toBe(true);
    expect(r.revenue).toBeNull();
    expect(r.buyCost).toBeNull();
    expect(r.salesTax).toBeNull();
    expect(r.brokerFee).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.recommendation).toBe('unknown');
    // build-side numbers still available
    expect(r.totalCost).toBeCloseTo(86_589, 6);
  });

  it('handles a single run at ME0 in an NPC station', () => {
    const r = buildVsBuy({
      ...baseInputs,
      runs: 1,
      me: 0,
      te: 0,
      facility: FACILITY_PRESETS.npcStation,
      rig: 'none',
      facilityTaxPct: undefined,
      skills: {},
    });
    expect(r.materials).toEqual([
      { typeID: 34, baseQuantity: 1000, quantity: 1000 },
      { typeID: 35, baseQuantity: 34, quantity: 34 },
    ]);
    expect(r.seconds).toBe(3600);
    // EIV 7_400: gross 370, scc 296, tax 0.25% = 18.5 -> 684.5
    expect(r.jobFee.total).toBeCloseTo(684.5, 6);
  });
});
