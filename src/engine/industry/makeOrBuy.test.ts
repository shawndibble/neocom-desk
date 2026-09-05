import { describe, it, expect } from 'vitest';
import { makeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MakeOrBuyContext, MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint, MaterialCostLine } from '@/engine/industry/types';

/** 5 Mechanical Parts (9840) per run from 20 Tritanium (34). */
const partsBlueprint: IndustryBlueprint = {
  name: 'Mechanical Parts Blueprint',
  time: 300,
  materials: [{ typeID: 34, quantity: 20 }],
  products: [{ typeID: 9840, quantity: 5 }],
};

/** No facility/rig bonuses, so effective quantities are the raw ME0 ones. */
const ctx: MakeOrBuyContext = {
  facility: FACILITY_PRESETS.npcStation,
  rig: 'none',
  security: 'highsec',
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 4 },
  hubPrices: { 34: 5 },
  skills: {},
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
    // 12 needed / 5 per run = 3 runs: 60 Tritanium at 5 = 300, plus a job fee
    // on an EIV of 60 x 4 = 240 (index 12 + SCC 9.6 + NPC tax 0.6 = 22.2).
    const result = makeOrBuy(line(), manufacturing, ctx);
    expect(result).toEqual({
      method: 'manufacturing',
      verdict: 'build',
      makeUnitPrice: 322.2 / 15,
      buyUnitPrice: 100,
      savings: (100 - 322.2 / 15) * 12,
      me: 0,
    });
  });

  it('sizes the job to what is left to buy, not to a single run', () => {
    // Per-job rounding is where run count shows up. In a rigged Raitaru at
    // ME10 the modifier is 0.87318, so one run needs ceil(17.46) = 18
    // Tritanium per 5 parts, while the three runs that actually cover 12
    // parts need ceil(52.39) = 53 for 15 — cheaper per unit than 3 x 18.
    const bonused: MakeOrBuyContext = {
      ...ctx,
      facility: FACILITY_PRESETS.raitaru,
      rig: 't1',
    };
    const researched: MaterialRecipe = { ...manufacturing, me: 10 };
    const result = makeOrBuy(line(), researched, bonused);
    // 53 x 5 = 265 materials, plus a fee on an EIV of 240: index 11.64
    // (3% structure discount) + SCC 9.6 + no structure tax = 21.24.
    expect(result?.makeUnitPrice).toBeCloseTo(286.24 / 15, 10);
    const oneRunQuote = (18 * 5 + 80 * 0.05 * 0.97 + 80 * 0.04) / 5;
    expect(result!.makeUnitPrice).toBeLessThan(oneRunQuote);
  });

  it('recommends buying when the job costs more than the hub asks', () => {
    const dear = { ...ctx, hubPrices: { 34: 500 } };
    const result = makeOrBuy(line(), manufacturing, dear);
    expect(result?.verdict).toBe('buy');
    // 60 x 500 = 30,000 + fee, against 12 x 100 of hub price.
    expect(result?.savings).toBeGreaterThan(0);
  });

  it('is null when one of the recipe inputs has no hub price', () => {
    expect(makeOrBuy(line(), manufacturing, { ...ctx, hubPrices: {} })).toBeNull();
  });

  it('compares against an override price when the plan carries one', () => {
    // The override is what this player actually pays, so it is what building
    // has to beat — not the hub price they have already said they can't get.
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

  it('uses the researched ME of a blueprint the character owns', () => {
    // ME10 on 3 runs: ceil(round(60 x 0.9, 2)) = 54 Tritanium, not 60.
    const researched = makeOrBuy(line(), { ...manufacturing, me: 10 }, ctx);
    const unresearched = makeOrBuy(line(), manufacturing, ctx);
    expect(researched!.makeUnitPrice).toBeLessThan(unresearched!.makeUnitPrice);
    // The job fee is unchanged — ME never reduces EIV.
    expect(researched!.makeUnitPrice).toBeCloseTo((54 * 5 + 22.2) / 15, 10);
  });

  it('is null rather than throwing on an out-of-range ME', () => {
    expect(makeOrBuy(line(), { ...manufacturing, me: 42 }, ctx)).toBeNull();
  });

  describe('reactions (issue #460)', () => {
    /** 5 Reinforced Carbon Fiber (9840, reused id) per run from 20 Tritanium. */
    const reactionFormula: IndustryBlueprint = {
      ...partsBlueprint,
      activity: 'reaction',
    };
    const reaction: MaterialRecipe = { method: 'reaction', blueprint: reactionFormula };

    it('prices a reaction material at its own job cost, quoted against an unfitted Athanor', () => {
      const result = makeOrBuy(line(), reaction, ctx);
      // 60 Tritanium at 5 = 300 (Athanor's 0% material bonus, same as ME0),
      // plus a job fee on an EIV of 240: index 12 + SCC 9.6 + Athanor's 0%
      // default tax (unlike the NPC station's fixed 0.25%) = 21.6.
      expect(result).toEqual({
        method: 'reaction',
        verdict: 'build',
        makeUnitPrice: 321.6 / 15,
        buyUnitPrice: 100,
        savings: (100 - 321.6 / 15) * 12,
        me: null,
      });
    });

    it("ignores the parent plan's own facility/rig — an engineering complex cannot host a reaction", () => {
      // A Raitaru's 1%/3% bonuses and a fitted rig would price this cheaper
      // if they leaked through. The quote must stay pinned to Athanor/none
      // regardless of what the parent plan is set to.
      const raitaruParent: MakeOrBuyContext = {
        ...ctx,
        facility: FACILITY_PRESETS.raitaru,
        rig: 't2',
      };
      const result = makeOrBuy(line(), reaction, raitaruParent);
      expect(result?.makeUnitPrice).toBeCloseTo(321.6 / 15, 10);
    });

    it('is null when an input has no hub price', () => {
      expect(makeOrBuy(line(), reaction, { ...ctx, hubPrices: {} })).toBeNull();
    });
  });

  describe('planetary industry', () => {
    const water: MaterialRecipe = {
      method: 'planetary',
      outputQuantity: 20,
      inputs: [{ typeID: 2073, quantity: 3000 }],
    };
    const piCtx: MakeOrBuyContext = { ...ctx, hubPrices: { 2073: 0.5 } };

    it('prices a schematic at its inputs, with no job fee', () => {
      // 3000 x 0.5 = 1500 per cycle, 20 units out: 75 each.
      const result = makeOrBuy(line({ typeID: 2398, unitPrice: 90 }), water, piCtx);
      expect(result).toEqual({
        method: 'planetary',
        verdict: 'build',
        makeUnitPrice: 75,
        buyUnitPrice: 90,
        savings: (90 - 75) * 12,
        me: null,
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
