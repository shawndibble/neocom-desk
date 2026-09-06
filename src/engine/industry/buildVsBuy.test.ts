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
      {
        typeID: 34,
        baseQuantity: 10_000,
        quantity: 8732,
        ownedQuantity: 0,
        remainingQuantity: 8732,
        unitPrice: 5,
        lineCost: 8732 * 5,
        unpriced: false,
      },
      {
        typeID: 35,
        baseQuantity: 340,
        quantity: 297,
        ownedQuantity: 0,
        remainingQuantity: 297,
        unitPrice: 120,
        lineCost: 297 * 120,
        unpriced: false,
      },
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
    expect(r.netRevenue).toBeCloseTo(1_000_000 - 33_750 - 15_000, 6); // 951_250

    const profit = 1_000_000 - 33_750 - 15_000 - 86_589;
    expect(r.profit).toBeCloseTo(profit, 6);
    expect(r.marginPct).toBeCloseTo((profit / 1_000_000) * 100, 6);
    expect(r.iskPerHour).toBeCloseTo(profit / (13_787.136 / 3600), 4);

    const grossProfit = 1_000_000 - 86_589;
    expect(r.grossProfit).toBeCloseTo(grossProfit, 6);
    expect(r.grossMargin).toBeCloseTo((grossProfit / 1_000_000) * 100, 6);
    expect(r.grossIskPerHour).toBeCloseTo(grossProfit / (13_787.136 / 3600), 4);

    // totalCost 86_589 over 10 units, Accounting V (3.375%) + Broker Relations V (1.5%)
    // revenue = 86_589 / (1 - 0.04875) = 91_026.5480...; price = revenue / 10
    expect(r.breakEvenPrice).toBeCloseTo(86_589 / (1 - 0.04875) / 10, 6);

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
    expect(r.grossProfit).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.grossIskPerHour).toBeNull();
    expect(r.recommendation).toBe('unknown');
    // break-even price only needs totalCost + quantity + skills, unaffected by unpriced materials
    expect(r.breakEvenPrice).not.toBeNull();
  });

  it('prices a fully owned material at zero and stops it blocking the plan', () => {
    // No hub listing for 35 at all — owning every unit must still price the plan.
    const r = buildVsBuy({
      ...baseInputs,
      hubPrices: { 34: 5, 999: 100_000 },
      materialSourcing: { 35: { ownedQuantity: 297 } },
    });
    expect(r.unpriceable).toBe(false);
    expect(r.unpricedMaterials).toEqual([]);
    expect(r.materialCost).toBeCloseTo(8732 * 5, 6);
    // Job fee is EIV-based (ME0 quantities x adjusted prices) — owning material
    // does not make the job cheaper to install.
    expect(r.jobFee.total).toBeCloseTo(7_289, 6);
    expect(r.totalCost).toBeCloseTo(8732 * 5 + 7_289, 6);
    expect(r.recommendation).toBe('build');
  });

  it('prices only the remainder of a partially owned material, at its override price', () => {
    const r = buildVsBuy({
      ...baseInputs,
      materialSourcing: { 34: { ownedQuantity: 4000, overridePrice: 6 } },
    });
    const [tritanium] = r.materials;
    expect(tritanium.ownedQuantity).toBe(4000);
    expect(tritanium.remainingQuantity).toBe(4732);
    expect(tritanium.unitPrice).toBe(6);
    expect(r.materialCost).toBeCloseTo(4732 * 6 + 297 * 120, 6);
  });

  it('applies an override price with nothing owned', () => {
    const r = buildVsBuy({ ...baseInputs, materialSourcing: { 34: { overridePrice: 7 } } });
    expect(r.materials[0].ownedQuantity).toBe(0);
    expect(r.materialCost).toBeCloseTo(8732 * 7 + 297 * 120, 6);
  });

  it('clamps an owned quantity larger than the job needs instead of crediting it', () => {
    const r = buildVsBuy({ ...baseInputs, materialSourcing: { 34: { ownedQuantity: 1_000_000 } } });
    expect(r.materials[0].ownedQuantity).toBe(8732);
    expect(r.materials[0].remainingQuantity).toBe(0);
    expect(r.materialCost).toBeCloseTo(297 * 120, 6);
  });

  it('leaves an empty sourcing map byte-identical to no sourcing at all', () => {
    expect(buildVsBuy({ ...baseInputs, materialSourcing: {} })).toEqual(buildVsBuy(baseInputs));
  });

  it('still blocks pricing when a partially owned material has no price for the rest', () => {
    const r = buildVsBuy({
      ...baseInputs,
      hubPrices: { 34: 5, 999: 100_000 },
      materialSourcing: { 35: { ownedQuantity: 296 } },
    });
    expect(r.unpriceable).toBe(true);
    expect(r.unpricedMaterials).toEqual([35]);
  });

  it('owned material does not rescue a plan whose product is unpriced', () => {
    const r = buildVsBuy({
      ...baseInputs,
      hubPrices: { 34: 5, 35: 120 },
      materialSourcing: { 34: { ownedQuantity: 8732 }, 35: { ownedQuantity: 297 } },
    });
    expect(r.unpriceable).toBe(true);
    expect(r.materialCost).toBe(0);
    expect(r.revenue).toBeNull();
  });

  it('flags a product with no hub price instead of throwing', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { 34: 5, 35: 120 } });
    expect(r.unpriceable).toBe(true);
    expect(r.revenue).toBeNull();
    expect(r.buyCost).toBeNull();
    expect(r.salesTax).toBeNull();
    expect(r.brokerFee).toBeNull();
    expect(r.netRevenue).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.grossProfit).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.grossIskPerHour).toBeNull();
    expect(r.recommendation).toBe('unknown');
    // break-even price depends only on totalCost + quantity + skills, not the product's hub price
    expect(r.breakEvenPrice).not.toBeNull();
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
      {
        typeID: 34,
        baseQuantity: 1000,
        quantity: 1000,
        ownedQuantity: 0,
        remainingQuantity: 1000,
        unitPrice: 5,
        lineCost: 5000,
        unpriced: false,
      },
      {
        typeID: 35,
        baseQuantity: 34,
        quantity: 34,
        ownedQuantity: 0,
        remainingQuantity: 34,
        unitPrice: 120,
        lineCost: 4080,
        unpriced: false,
      },
    ]);
    expect(r.seconds).toBe(3600);
    // EIV 7_400: gross 370, scc 296, tax 0.25% = 18.5 -> 684.5
    expect(r.jobFee.total).toBeCloseTo(684.5, 6);
  });
  describe('materialPrices', () => {
    it('prices materials off the given map while the product keeps its hub sell price', () => {
      const r = buildVsBuy({
        ...baseInputs,
        runs: 1,
        me: 0,
        te: 0,
        // Buy-order side: cheaper materials, same product.
        materialPrices: { 34: 4, 35: 90 },
      });

      // Quantities are the facility-adjusted ones; only the unit prices move.
      const [tritanium, pyerite] = r.materials;
      expect(r.materials.map((m) => m.unitPrice)).toEqual([4, 90]);
      expect(r.materialCost).toBeCloseTo(tritanium.quantity * 4 + pyerite.quantity * 90, 6);
      // Acquisition Verdict still compares against buying the product
      // outright, which pays the hub's lowest sell.
      expect(r.revenue).toBeCloseTo(100_000, 6);
      expect(r.unpriceable).toBe(false);
    });

    it('defaults to hubPrices when no material map is given', () => {
      const withOut = buildVsBuy({ ...baseInputs, runs: 1, me: 0, te: 0 });
      const withSame = buildVsBuy({
        ...baseInputs,
        runs: 1,
        me: 0,
        te: 0,
        materialPrices: baseInputs.hubPrices,
      });
      expect(withSame.materialCost).toBeCloseTo(withOut.materialCost, 6);
    });

    it('flags a material the map cannot price, even when the hub sell map can', () => {
      const r = buildVsBuy({
        ...baseInputs,
        runs: 1,
        me: 0,
        te: 0,
        // 35 has no buy order at the hub.
        materialPrices: { 34: 4 },
      });

      expect(r.unpricedMaterials).toEqual([35]);
      expect(r.unpriceable).toBe(true);
      expect(r.recommendation).toBe('unknown');
      expect(r.profit).toBeNull();
    });
  });
});
