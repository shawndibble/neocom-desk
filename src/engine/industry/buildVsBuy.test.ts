import { describe, it, expect } from 'vitest';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS, SKILL_IDS } from '@/engine/industry/types';
import type { IndustryBlueprint, IndustryInputs } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';

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
  rigFit: ['meT1', 'teT1', 'none'],
  security: 'highsec',
  facilityTaxPct: 1,
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 4, 35: 100 },
  hubPrices: { 34: 5, 35: 120, 999: 100_000 },
  modifiers: characterModifiers({
    skills: {
      [SKILL_IDS.industry]: 5,
      [SKILL_IDS.advancedIndustry]: 4,
      [SKILL_IDS.accounting]: 5,
      [SKILL_IDS.brokerRelations]: 5,
    },
    implantTypeIds: [],
  }),
};

describe('buildVsBuy past the max production limit', () => {
  it('rounds materials per job, prices one fee for the total runs, and times the longest job', () => {
    const plain = buildVsBuy(baseInputs);
    const split = buildVsBuy({ ...baseInputs, blueprint: { ...bp, maxProductionLimit: 4 } });

    expect(plain.jobRuns).toEqual([10]);
    expect(split.jobRuns).toEqual([4, 3, 3]);
    const perJob = [4, 3, 3].map(
      (runs) => buildVsBuy({ ...baseInputs, runs }).materials[1].quantity
    );
    expect(split.materials[1].quantity).toBe(perJob.reduce((a, b) => a + b, 0));
    expect(split.jobFee).toEqual(plain.jobFee);
    expect(split.seconds).toBe(buildVsBuy({ ...baseInputs, runs: 4 }).seconds);
  });

  it('is identical to today for a plan within the limit', () => {
    const within = buildVsBuy({ ...baseInputs, blueprint: { ...bp, maxProductionLimit: 10 } });
    expect(within).toEqual(buildVsBuy(baseInputs));
  });
});

describe('buildVsBuy', () => {
  it('computes the full hand-checked scenario', () => {
    const r = buildVsBuy(baseInputs);

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
    expect(r.materialCost).toBeCloseTo(8732 * 5 + 297 * 120, 6);

    expect(r.seconds).toBeCloseTo(13_787.136, 6);

    expect(r.jobFee.eiv).toBe(74_000);
    expect(r.jobFee.grossCost).toBeCloseTo(74_000 * 0.05 * 0.97, 6);
    expect(r.jobFee.sccSurcharge).toBeCloseTo(2_960, 6);
    expect(r.jobFee.facilityTax).toBeCloseTo(740, 6);
    expect(r.jobFee.total).toBeCloseTo(7_289, 6);

    expect(r.totalCost).toBeCloseTo(86_589, 6);

    expect(r.buyCost).toBe(1_000_000);
    expect(r.revenue).toBe(1_000_000);
    expect(r.salesTax).toBeCloseTo(1_000_000 * 0.03375, 6);
    expect(r.brokerFee).toBeCloseTo(1_000_000 * 0.015, 6);
    expect(r.netRevenue).toBeCloseTo(1_000_000 - 33_750 - 15_000, 6);

    const profit = 1_000_000 - 33_750 - 15_000 - 86_589;
    expect(r.profit).toBeCloseTo(profit, 6);
    expect(r.marginPct).toBeCloseTo((profit / 1_000_000) * 100, 6);
    expect(r.iskPerHour).toBeCloseTo(profit / (13_787.136 / 3600), 4);

    const grossProfit = 1_000_000 - 86_589;
    expect(r.grossProfit).toBeCloseTo(grossProfit, 6);
    expect(r.grossMargin).toBeCloseTo((grossProfit / 1_000_000) * 100, 6);
    expect(r.grossIskPerHour).toBeCloseTo(grossProfit / (13_787.136 / 3600), 4);

    expect(r.breakEvenPrice).toBeCloseTo(86_589 / (1 - 0.04875) / 10, 6);

    expect(r.unpriceable).toBe(false);
    expect(r.unpricedMaterials).toEqual([]);
    expect(r.recommendation).toBe('build');
  });

  it('applies a manufacturing-time implant bonus to seconds (issue #1229)', () => {
    const r = buildVsBuy({
      ...baseInputs,
      modifiers: { ...baseInputs.modifiers, manufacturingTimeImplantPct: 4 },
    });
    expect(r.seconds).toBeCloseTo(13_235.65056, 6);
  });

  it('recommends buy when building costs more than the hub sell price', () => {
    const r = buildVsBuy({ ...baseInputs, hubPrices: { ...baseInputs.hubPrices, 999: 8_000 } });
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
    expect(r.materialCost).toBeCloseTo(8732 * 5, 6);
    expect(r.profit).toBeNull();
    expect(r.marginPct).toBeNull();
    expect(r.iskPerHour).toBeNull();
    expect(r.grossProfit).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.grossIskPerHour).toBeNull();
    expect(r.recommendation).toBe('unknown');
    expect(r.breakEvenPrice).not.toBeNull();
  });

  it('prices a fully owned material at zero and stops it blocking the plan', () => {
    const r = buildVsBuy({
      ...baseInputs,
      hubPrices: { 34: 5, 999: 100_000 },
      materialSourcing: { 35: { ownedQuantity: 297 } },
    });
    expect(r.unpriceable).toBe(false);
    expect(r.unpricedMaterials).toEqual([]);
    expect(r.materialCost).toBeCloseTo(8732 * 5, 6);
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
    expect(r.breakEvenPrice).not.toBeNull();
    expect(r.totalCost).toBeCloseTo(86_589, 6);
  });

  it('handles a single run at ME0 in an NPC station', () => {
    const r = buildVsBuy({
      ...baseInputs,
      runs: 1,
      me: 0,
      te: 0,
      facility: FACILITY_PRESETS.npcStation,
      rigFit: ['none', 'none', 'none'],
      facilityTaxPct: undefined,
      modifiers: NO_CHARACTER_MODIFIERS,
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
    expect(r.jobFee.total).toBeCloseTo(684.5, 6);
  });
  describe('materialPrices', () => {
    it('prices materials off the given map while the product keeps its hub sell price', () => {
      const r = buildVsBuy({
        ...baseInputs,
        runs: 1,
        me: 0,
        te: 0,
        materialPrices: { 34: 4, 35: 90 },
      });

      const [tritanium, pyerite] = r.materials;
      expect(r.materials.map((m) => m.unitPrice)).toEqual([4, 90]);
      expect(r.materialCost).toBeCloseTo(tritanium.quantity * 4 + pyerite.quantity * 90, 6);
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
        materialPrices: { 34: 4 },
      });

      expect(r.unpricedMaterials).toEqual([35]);
      expect(r.unpriceable).toBe(true);
      expect(r.recommendation).toBe('unknown');
      expect(r.profit).toBeNull();
    });
  });

  describe('buildHere — sourcing a material by building it instead of buying it', () => {
    const pyeriteBlueprint: IndustryBlueprint = {
      name: 'Pyerite Reprocessing (stand-in blueprint)',
      time: 60,
      materials: [{ typeID: 36, quantity: 1 }],
      products: [{ typeID: 35, quantity: 1 }],
    };
    const recipeFor =
      (map: Record<number, MaterialRecipe>) =>
      (typeID: number): MaterialRecipe | null =>
        map[typeID] ?? null;

    it('does nothing when buildHere/recipeFor are absent — unchanged from the baseline', () => {
      const withExtras = buildVsBuy({
        ...baseInputs,
        buildHere: undefined,
        recipeFor: undefined,
      });
      expect(withExtras).toEqual(buildVsBuy(baseInputs));
    });

    it('replaces a material’s market price with its rolled-up build cost, and the change reaches profit', () => {
      const r = buildVsBuy({
        ...baseInputs,
        buildHere: [35],
        recipeFor: recipeFor({
          35: { method: 'manufacturing', blueprint: pyeriteBlueprint, me: 0 },
        }),
        materialPrices: { ...baseInputs.hubPrices, 36: 50 },
      });
      const baseline = buildVsBuy(baseInputs);

      const pyerite = r.materials.find((m) => m.typeID === 35);
      expect(pyerite?.subBuild).toBeDefined();
      expect(pyerite?.unitPrice).toBeNull();
      expect(r.materialCost).not.toBeCloseTo(baseline.materialCost, 0);
      expect(r.totalCost).not.toBeCloseTo(baseline.totalCost, 0);
      expect(r.profit).not.toBeNull();
      expect(r.profit).not.toBeCloseTo(baseline.profit ?? 0, 0);
    });

    it('resolves profit for a material the hub does not sell at all, once it is marked to build', () => {
      const withoutPrice = { ...baseInputs.hubPrices };
      delete withoutPrice[35];
      const inputsWithNoPrice = { ...baseInputs, hubPrices: withoutPrice };

      const unbuilt = buildVsBuy(inputsWithNoPrice);
      expect(unbuilt.unpriceable).toBe(true);
      expect(unbuilt.profit).toBeNull();

      const built = buildVsBuy({
        ...inputsWithNoPrice,
        buildHere: [35],
        recipeFor: recipeFor({
          35: { method: 'manufacturing', blueprint: pyeriteBlueprint, me: 0 },
        }),
        materialPrices: { ...inputsWithNoPrice.hubPrices, 36: 200 },
      });
      expect(built.unpriceable).toBe(false);
      expect(built.profit).not.toBeNull();
    });

    it('still blocks profit when a built material bottoms out in something neither owned, priced, nor buildable', () => {
      const r = buildVsBuy({
        ...baseInputs,
        buildHere: [35],
        recipeFor: recipeFor({
          35: { method: 'manufacturing', blueprint: pyeriteBlueprint, me: 0 },
        }),
        materialPrices: { 34: baseInputs.hubPrices[34] },
      });
      expect(r.unpriceable).toBe(true);
      expect(r.unpricedMaterials).toEqual([36]);
      expect(r.profit).toBeNull();
    });

    it('leaves the job fee alone — only materialCost moves when a material is built', () => {
      const baseline = buildVsBuy(baseInputs);
      const r = buildVsBuy({
        ...baseInputs,
        buildHere: [35],
        recipeFor: recipeFor({
          35: { method: 'manufacturing', blueprint: pyeriteBlueprint, me: 0 },
        }),
      });
      expect(r.jobFee).toEqual(baseline.jobFee);
      expect(r.totalCost).toBeCloseTo(r.materialCost + r.jobFee.total, 6);
    });

    it('resolves a reaction-produced material against reactionFacility, not this plan’s own facility (issue #698)', () => {
      const reactionFormula: IndustryBlueprint = {
        ...pyeriteBlueprint,
        activity: 'reaction',
      };
      const withoutReactionFacility = buildVsBuy({
        ...baseInputs,
        adjustedPrices: { ...baseInputs.adjustedPrices, 36: 50 },
        buildHere: [35],
        recipeFor: recipeFor({ 35: { method: 'reaction', blueprint: reactionFormula } }),
        materialPrices: { ...baseInputs.hubPrices, 36: 50 },
      });
      const withReactionFacility = buildVsBuy({
        ...baseInputs,
        adjustedPrices: { ...baseInputs.adjustedPrices, 36: 50 },
        buildHere: [35],
        recipeFor: recipeFor({ 35: { method: 'reaction', blueprint: reactionFormula } }),
        materialPrices: { ...baseInputs.hubPrices, 36: 50 },
        reactionFacility: {
          facility: FACILITY_PRESETS.tatara,
          rigFit: ['none', 'none', 'none'],
          security: 'highsec',
          facilityTaxPct: 3,
          systemCostIndex: 0.15,
        },
      });

      const pyerite = withReactionFacility.materials.find((m) => m.typeID === 35);
      expect(pyerite?.subBuild).toBeDefined();
      expect(withReactionFacility.materialCost).not.toBeCloseTo(
        withoutReactionFacility.materialCost,
        0
      );
    });
  });
});

describe('buildVsBuy — regional job tax (Exordium Industrial Tax)', () => {
  it('adds 5% of EIV to the job fee and the total cost, and nothing without it', () => {
    const plain = buildVsBuy(baseInputs);
    const taxed = buildVsBuy({ ...baseInputs, regionalTaxPct: 5 });
    const eiv = taxed.jobFee.eiv;
    expect(taxed.jobFee.regionalTax).toBeCloseTo(eiv * 0.05, 6);
    expect(taxed.jobFee.total - plain.jobFee.total).toBeCloseTo(eiv * 0.05, 6);
    expect(taxed.totalCost - plain.totalCost).toBeCloseTo(eiv * 0.05, 6);
    expect(plain.jobFee.regionalTax).toBe(0);
  });
});

describe('buildVsBuy — Blueprint Acquisition for the top-level product (issue #838)', () => {
  it('does nothing when the caller does not opt in', () => {
    const r = buildVsBuy(baseInputs);
    expect(r.materials.some((m) => m.acquisitionTier)).toBe(false);
    expect(r.materials).toHaveLength(2);
  });

  it('prepends a priced row first, and it counts toward materialCost/unpriceable', () => {
    const r = buildVsBuy({
      ...baseInputs,
      blueprintAcquisition: { blueprintTypeID: 1001, line: { unitPrice: 750, owned: false } },
    });
    expect(r.materials[0]).toMatchObject({
      typeID: 1001,
      remainingQuantity: 1,
      unitPrice: 750,
      lineCost: 750,
      unpriced: false,
      acquisitionTier: { me: baseInputs.me, te: baseInputs.te },
    });
    expect(r.materials).toHaveLength(3);
    expect(r.materialCost).toBe(
      750 + r.materials.filter((m) => m.typeID !== 1001).reduce((s, m) => s + m.lineCost, 0)
    );
    expect(r.unpriceable).toBe(false);
  });

  it('adds no row when the resolved tier is an owned BPO', () => {
    const r = buildVsBuy({
      ...baseInputs,
      blueprintAcquisition: { blueprintTypeID: 1001, line: null },
    });
    expect(r.materials).toHaveLength(2);
  });

  it('an unpriceable line makes the whole plan unpriceable', () => {
    const r = buildVsBuy({
      ...baseInputs,
      blueprintAcquisition: { blueprintTypeID: 1001, line: { unitPrice: null, owned: false } },
    });
    expect(r.unpricedMaterials).toContain(1001);
    expect(r.unpriceable).toBe(true);
  });

  it('a manual overridePrice on the blueprint typeID wins over the resolved price', () => {
    const r = buildVsBuy({
      ...baseInputs,
      materialSourcing: { 1001: { overridePrice: 1 } },
      blueprintAcquisition: { blueprintTypeID: 1001, line: { unitPrice: 750, owned: false } },
    });
    expect(r.materials[0]).toMatchObject({ typeID: 1001, unitPrice: 1, lineCost: 1 });
  });
});
