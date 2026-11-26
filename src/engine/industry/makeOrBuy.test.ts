import { describe, it, expect } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { makeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MakeOrBuyContext, MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint, MaterialCostLine } from '@/engine/industry/types';

const partsBlueprint: IndustryBlueprint = {
  name: 'Mechanical Parts Blueprint',
  time: 300,
  materials: [{ typeID: 34, quantity: 20 }],
  products: [{ typeID: 9840, quantity: 5 }],
};

const ctx: MakeOrBuyContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 4 },
  materialPrices: { 34: 5 },
  modifiers: NO_CHARACTER_MODIFIERS,
};

function line(overrides: Partial<MaterialCostLine> = {}): MaterialCostLine {
  return {
    typeID: 9840,
    baseQuantity: 12,
    quantity: 12,
    ownedQuantity: 0,
    remainingQuantity: 12,
    unitPrice: 100,
    lineCost: 1200,
    unpriced: false,
    ...overrides,
  };
}

const manufacturing: MaterialRecipe = { method: 'manufacturing', blueprint: partsBlueprint, me: 0 };

describe('makeOrBuy', () => {
  it('is null for a material nothing produces', () => {
    expect(makeOrBuy(line(), null, ctx)).toBeNull();
  });

  it('is null when the material itself has no price to compare against', () => {
    expect(makeOrBuy(line({ unitPrice: null }), manufacturing, ctx)).toBeNull();
  });

  it('prices a manufactured material at its own job cost per unit', () => {
    const result = makeOrBuy(line(), manufacturing, ctx);
    expect(result).toEqual({
      method: 'manufacturing',
      verdict: 'build',
      makeUnitPrice: 322.2 / 15,
      buyUnitPrice: 100,
      savings: (100 - 322.2 / 15) * 12,
      me: 0,
      blueprintCost: 0,
    });
  });

  it('sizes the job to what is left to buy, not to a single run', () => {
    const bonused: MakeOrBuyContext = {
      ...ctx,
      facility: FACILITY_PRESETS.raitaru,
      rigFit: ['meT1', 'teT1', 'none'],
    };
    const researched: MaterialRecipe = { ...manufacturing, me: 10 };
    const result = makeOrBuy(line(), researched, bonused);
    expect(result?.makeUnitPrice).toBeCloseTo(286.24 / 15, 10);
    const oneRunQuote = (18 * 5 + 80 * 0.05 * 0.97 + 80 * 0.04) / 5;
    expect(result!.makeUnitPrice).toBeLessThan(oneRunQuote);
  });

  it('recommends buying when the job costs more than the hub asks', () => {
    const dear = { ...ctx, materialPrices: { 34: 500 } };
    const result = makeOrBuy(line(), manufacturing, dear);
    expect(result?.verdict).toBe('buy');
    expect(result?.savings).toBeGreaterThan(0);
  });

  it('is null when one of the recipe inputs has no hub price', () => {
    expect(makeOrBuy(line(), manufacturing, { ...ctx, materialPrices: {} })).toBeNull();
  });

  it('compares against an override price when the plan carries one', () => {
    const result = makeOrBuy(line({ unitPrice: 10 }), manufacturing, ctx);
    expect(result?.buyUnitPrice).toBe(10);
    expect(result?.verdict).toBe('buy');
  });

  it('leaves a fully owned row a verdict but no savings', () => {
    const owned = line({ ownedQuantity: 12, remainingQuantity: 0, lineCost: 0 });
    const result = makeOrBuy(owned, manufacturing, ctx);
    expect(result?.verdict).toBe('build');
    expect(result?.savings).toBe(0);
  });

  describe('Blueprint Acquisition', () => {
    const acquiring = (resolution: {
      me: number;
      line: { unitPrice: number | null; owned: boolean } | null;
    }): MakeOrBuyContext => ({
      ...ctx,
      acquisitionFor: (productTypeID, needed) => {
        expect(productTypeID).toBe(9840);
        expect(needed).toBe(12);
        return { ...resolution, te: 0, blueprintTypeID: 9841 };
      },
    });

    it('adds the whole blueprint purchase to the build side, spread over the units made', () => {
      const result = makeOrBuy(
        line(),
        manufacturing,
        acquiring({ me: 0, line: { unitPrice: 3000, owned: false } })
      );
      expect(result?.blueprintCost).toBe(3000);
      expect(result?.makeUnitPrice).toBeCloseTo((322.2 + 3000) / 15, 10);
      expect(result?.verdict).toBe('buy');
    });

    it('builds at the acquired tier’s ME and charges nothing for an owned copy', () => {
      const result = makeOrBuy(
        line(),
        manufacturing,
        acquiring({ me: 10, line: { unitPrice: 0, owned: true } })
      );
      expect(result?.me).toBe(10);
      expect(result?.blueprintCost).toBe(0);
      expect(result?.makeUnitPrice).toBeCloseTo((54 * 5 + 22.2) / 15, 10);
    });

    it('gives no advice when the blueprint must be bought but nothing prices it', () => {
      expect(
        makeOrBuy(
          line(),
          manufacturing,
          acquiring({ me: 0, line: { unitPrice: null, owned: false } })
        )
      ).toBeNull();
    });
  });

  it('uses the researched ME of a blueprint the character owns', () => {
    const researched = makeOrBuy(line(), { ...manufacturing, me: 10 }, ctx);
    const unresearched = makeOrBuy(line(), manufacturing, ctx);
    expect(researched!.makeUnitPrice).toBeLessThan(unresearched!.makeUnitPrice);
    expect(researched!.makeUnitPrice).toBeCloseTo((54 * 5 + 22.2) / 15, 10);
  });

  it('is null rather than throwing on an out-of-range ME', () => {
    expect(makeOrBuy(line(), { ...manufacturing, me: 42 }, ctx)).toBeNull();
  });

  describe('reactions (issue #460)', () => {
    const reactionFormula: IndustryBlueprint = {
      ...partsBlueprint,
      activity: 'reaction',
    };
    const reaction: MaterialRecipe = { method: 'reaction', blueprint: reactionFormula };

    it('prices a reaction material at its own job cost, quoted against an unfitted Athanor', () => {
      const result = makeOrBuy(line(), reaction, ctx);
      expect(result).toEqual({
        method: 'reaction',
        verdict: 'build',
        makeUnitPrice: 321.6 / 15,
        buyUnitPrice: 100,
        savings: (100 - 321.6 / 15) * 12,
        me: null,
        blueprintCost: 0,
      });
    });

    it("ignores the parent plan's own facility/rig — an engineering complex cannot host a reaction", () => {
      const raitaruParent: MakeOrBuyContext = {
        ...ctx,
        facility: FACILITY_PRESETS.raitaru,
        rigFit: ['meT2', 'teT2', 'none'],
      };
      const result = makeOrBuy(line(), reaction, raitaruParent);
      expect(result?.makeUnitPrice).toBeCloseTo(321.6 / 15, 10);
    });

    it('is null when an input has no hub price', () => {
      expect(makeOrBuy(line(), reaction, { ...ctx, materialPrices: {} })).toBeNull();
    });

    it("falls back to the plan's own facility/rig, not the fixed Athanor guess, when that plan's own activity is already a reaction (issue #698)", () => {
      const reactionActivityCtx: MakeOrBuyContext = {
        ...ctx,
        facility: FACILITY_PRESETS.tatara,
        rigFit: ['meT2', 'none', 'none'],
      };
      const result = makeOrBuy(line(), reaction, reactionActivityCtx);
      expect(result?.makeUnitPrice).toBeCloseTo(316.6 / 15, 10);
    });

    it('quotes against the resolved Reaction Location when one is configured (issue #698)', () => {
      const withReactionLocation: MakeOrBuyContext = {
        ...ctx,
        reactionFacility: {
          facility: FACILITY_PRESETS.tatara,
          rigFit: ['none', 'none', 'none'],
          security: 'highsec',
          facilityTaxPct: 2,
          systemCostIndex: 0.1,
        },
      };
      const result = makeOrBuy(line(), reaction, withReactionLocation);
      expect(result?.makeUnitPrice).toBeCloseTo(338.4 / 15, 10);
    });
  });

  describe('skill gate (issue #1231)', () => {
    const gatedBlueprint: IndustryBlueprint = {
      ...partsBlueprint,
      skills: [{ typeID: 3380, level: 5 }],
    };
    const gatedManufacturing: MaterialRecipe = {
      method: 'manufacturing',
      blueprint: gatedBlueprint,
      me: 0,
    };
    const noAccountSkills = new Map<number, Record<number, number>>([[1, {}]]);
    const sufficientAccountSkills = new Map<number, Record<number, number>>([[1, { 3380: 5 }]]);

    it('forces buy when no account character can install the job, even though building is cheaper', () => {
      const result = makeOrBuy(line(), gatedManufacturing, {
        ...ctx,
        accountSkills: noAccountSkills,
      });
      expect(result?.verdict).toBe('buy');
      expect(result?.skillGate).toEqual({
        gated: true,
        shortfall: [{ typeID: 3380, haveLevel: 0, needLevel: 5 }],
        bestCharacterId: 1,
      });
    });

    it('leaves the cost-based verdict alone when an account character meets the requirement', () => {
      const result = makeOrBuy(line(), gatedManufacturing, {
        ...ctx,
        accountSkills: sufficientAccountSkills,
      });
      expect(result?.verdict).toBe('build');
      expect(result?.skillGate).toBeUndefined();
    });

    it('leaves the cost-based verdict alone when no account skills are supplied', () => {
      const result = makeOrBuy(line(), gatedManufacturing, ctx);
      expect(result?.verdict).toBe('build');
      expect(result?.skillGate).toBeUndefined();
    });

    it('does not gate planetary production, which has no skill requirement', () => {
      const water: MaterialRecipe = {
        method: 'planetary',
        outputQuantity: 20,
        inputs: [{ typeID: 2073, quantity: 3000 }],
      };
      const result = makeOrBuy(line({ typeID: 2398, unitPrice: 90 }), water, {
        ...ctx,
        materialPrices: { 2073: 0.5 },
        accountSkills: noAccountSkills,
      });
      expect(result?.verdict).toBe('build');
      expect(result?.skillGate).toBeUndefined();
    });
  });

  describe('planetary industry', () => {
    const water: MaterialRecipe = {
      method: 'planetary',
      outputQuantity: 20,
      inputs: [{ typeID: 2073, quantity: 3000 }],
    };
    const piCtx: MakeOrBuyContext = { ...ctx, materialPrices: { 2073: 0.5 } };

    it('prices a schematic at its inputs, with no job fee', () => {
      const result = makeOrBuy(line({ typeID: 2398, unitPrice: 90 }), water, piCtx);
      expect(result).toEqual({
        method: 'planetary',
        verdict: 'build',
        makeUnitPrice: 75,
        buyUnitPrice: 90,
        savings: (90 - 75) * 12,
        me: null,
        blueprintCost: 0,
      });
    });

    it('is null when an input has no hub price', () => {
      expect(makeOrBuy(line({ typeID: 2398 }), water, ctx)).toBeNull();
    });

    it('is null for a schematic with no inputs', () => {
      const empty: MaterialRecipe = { method: 'planetary', outputQuantity: 20, inputs: [] };
      expect(makeOrBuy(line({ typeID: 2398 }), empty, piCtx)).toBeNull();
    });
  });
});
