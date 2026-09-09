import { describe, it, expect } from 'vitest';
import { autoBuildHere, MAX_AUTO_BUILD_DEPTH } from '@/engine/industry/autoMakeOrBuy';
import { makeOrBuy, type MakeOrBuyContext, type MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { effectiveMaterials } from '@/engine/industry/materials';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';

// A four-level chain, cheapest to build at every level: product (600) <-
// gearA (502) <- gearB (501) <- gearC (500) <- gearD (499) <- Tritanium (34,
// unbuildable). Each recipe eats 4 of its input to make 5 of its output, so
// building always massively undercuts the inflated buy prices below.
const productBlueprint: IndustryBlueprint = {
  name: 'Product',
  time: 100,
  materials: [{ typeID: 502, quantity: 3 }],
  products: [{ typeID: 600, quantity: 1 }],
};
const gearABlueprint: IndustryBlueprint = {
  name: 'Gear A',
  time: 100,
  materials: [{ typeID: 501, quantity: 4 }],
  products: [{ typeID: 502, quantity: 5 }],
};
const gearBBlueprint: IndustryBlueprint = {
  name: 'Gear B',
  time: 100,
  materials: [{ typeID: 500, quantity: 4 }],
  products: [{ typeID: 501, quantity: 5 }],
};
const gearCBlueprint: IndustryBlueprint = {
  name: 'Gear C',
  time: 100,
  materials: [{ typeID: 499, quantity: 4 }],
  products: [{ typeID: 500, quantity: 5 }],
};
const gearDBlueprint: IndustryBlueprint = {
  name: 'Gear D',
  time: 100,
  materials: [{ typeID: 34, quantity: 20 }],
  products: [{ typeID: 499, quantity: 5 }],
};

const recipes: Record<number, MaterialRecipe> = {
  502: { method: 'manufacturing', blueprint: gearABlueprint, me: 0 },
  501: { method: 'manufacturing', blueprint: gearBBlueprint, me: 0 },
  500: { method: 'manufacturing', blueprint: gearCBlueprint, me: 0 },
  499: { method: 'manufacturing', blueprint: gearDBlueprint, me: 0 },
};
function recipeFor(typeID: number): MaterialRecipe | null {
  return recipes[typeID] ?? null;
}

const ctx: MakeOrBuyContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
  systemCostIndex: 0.05,
  adjustedPrices: { 34: 1, 499: 1, 500: 1, 501: 1 },
  materialPrices: { 34: 1, 499: 500, 500: 1000, 501: 2000, 502: 5000 },
  skills: {},
};

describe('autoBuildHere', () => {
  it('picks nothing at depth 0 — matches plain (no auto-build) behavior', () => {
    expect(autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 0, runs: 1 }).size).toBe(0);
  });

  it('evaluates only the direct materials at depth 1', () => {
    const result = autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 1, runs: 1 });
    expect(result).toEqual(new Set([502]));
  });

  it('recurses one more level per unit of depth', () => {
    expect(autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 2, runs: 1 })).toEqual(
      new Set([502, 501])
    );
    expect(autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 3, runs: 1 })).toEqual(
      new Set([502, 501, 500])
    );
  });

  it('clamps to MAX_AUTO_BUILD_DEPTH regardless of a larger requested depth', () => {
    expect(MAX_AUTO_BUILD_DEPTH).toBe(3);
    const result = autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 99, runs: 1 });
    // gearD (499) is a 4th, still-cheaper-to-build level — excluded only if
    // the clamp actually bites, not merely because nothing produces it.
    expect(result).toEqual(new Set([502, 501, 500]));
  });

  it('excludes a material where buying beats building, and never inspects its own inputs', () => {
    const dear: MakeOrBuyContext = { ...ctx, materialPrices: { ...ctx.materialPrices, 502: 1 } };
    const result = autoBuildHere(productBlueprint, 0, { recipeFor, ctx: dear, depth: 3, runs: 1 });
    expect(result.size).toBe(0);
  });

  it('skips a material nothing produces, without throwing', () => {
    const mined: IndustryBlueprint = {
      ...productBlueprint,
      materials: [{ typeID: 34, quantity: 10 }],
    };
    expect(autoBuildHere(mined, 0, { recipeFor, ctx, depth: 3, runs: 1 }).size).toBe(0);
  });

  it('excludes a material with no hub price to compare against', () => {
    const noPrice: MakeOrBuyContext = { ...ctx, materialPrices: { 501: 2000, 34: 1 } };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor,
      ctx: noPrice,
      depth: 3,
      runs: 1,
    });
    expect(result.size).toBe(0);
  });

  it('never auto-builds a reaction or planetary material, even when cheaper', () => {
    // resolveMaterial only ever honours a manufacturing buildHere entry — an
    // auto-picked reaction/planetary typeID would silently do nothing in the
    // real plan, so it must never be offered here either.
    const reactionRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'reaction', blueprint: gearABlueprint },
    };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => reactionRecipes[id] ?? null,
      ctx,
      depth: 3,
      runs: 1,
    });
    expect(result.size).toBe(0);
  });

  it('never revisits a material that is already its own ancestor on this branch', () => {
    const selfBlueprint: IndustryBlueprint = {
      name: 'Self-referencing',
      time: 100,
      materials: [{ typeID: 700, quantity: 1 }],
      products: [{ typeID: 700, quantity: 1 }],
    };
    const root: IndustryBlueprint = {
      ...productBlueprint,
      materials: [{ typeID: 700, quantity: 1 }],
    };
    const cyclic = (id: number): MaterialRecipe | null =>
      id === 700 ? { method: 'manufacturing', blueprint: selfBlueprint, me: 0 } : null;
    const cyclicCtx: MakeOrBuyContext = { ...ctx, materialPrices: { 700: 1000 } };
    expect(() =>
      autoBuildHere(root, 0, { recipeFor: cyclic, ctx: cyclicCtx, depth: 3, runs: 1 })
    ).not.toThrow();
  });

  it("sizes the root job to the plan's real runs, not always 1 — a verdict decided at the wrong scale would disagree with what the recursive engine later bills", () => {
    // Per-job rounding (materials.ts) happens once per job regardless of run
    // count, so a bigger job amortizes the rounding waste better and prices
    // cheaper per unit — the same effect makeOrBuy.test.ts's "sizes the job
    // to what is left to buy, not to a single run" case demonstrates. A
    // rigged Raitaru at ME10 is a real, if modest, instance of it.
    const partsBlueprint: IndustryBlueprint = {
      name: 'Mechanical Parts Blueprint',
      time: 300,
      materials: [{ typeID: 34, quantity: 20 }],
      products: [{ typeID: 9840, quantity: 5 }],
    };
    const recipe: MaterialRecipe = { method: 'manufacturing', blueprint: partsBlueprint, me: 10 };
    const root: IndustryBlueprint = {
      name: 'Product',
      time: 100,
      materials: [{ typeID: 9840, quantity: 5 }],
      products: [{ typeID: 600, quantity: 1 }],
    };
    const riggedCtx: MakeOrBuyContext = {
      facility: FACILITY_PRESETS.raitaru,
      rigFit: ['meT1', 'teT1', 'none'],
      security: 'highsec',
      systemCostIndex: 0.05,
      adjustedPrices: { 34: 4 },
      materialPrices: { 34: 5, 9840: 0 },
      skills: {},
    };

    // Reference per-unit build costs at the two scales `autoBuildHere` could
    // see for this same material: root run once, or three times. Computed
    // from the real engine functions rather than hand-derived, so the test
    // doesn't depend on independently-verified arithmetic.
    const neededAt = (runs: number) => effectiveMaterials(root, runs, 0, riggedCtx)[0]!.quantity;
    const referenceLine = (needed: number) => ({
      typeID: 9840,
      baseQuantity: needed,
      quantity: needed,
      ownedQuantity: 0,
      remainingQuantity: needed,
      unitPrice: 1,
      lineCost: 0,
      unpriced: false,
    });
    const at1Run = makeOrBuy(referenceLine(neededAt(1)), recipe, riggedCtx)!.makeUnitPrice;
    const at3Runs = makeOrBuy(referenceLine(neededAt(3)), recipe, riggedCtx)!.makeUnitPrice;
    expect(at3Runs).toBeLessThan(at1Run);

    // A buy price strictly between the two only reads as "build" once the
    // real 3-run scale is used — the old hardcoded-to-1-run behavior would
    // have missed it.
    const ctx: MakeOrBuyContext = {
      ...riggedCtx,
      materialPrices: { ...riggedCtx.materialPrices, 9840: (at1Run + at3Runs) / 2 },
    };
    const opts = { recipeFor: (id: number) => (id === 9840 ? recipe : null), ctx, depth: 1 };
    expect(autoBuildHere(root, 0, { ...opts, runs: 1 })).toEqual(new Set());
    expect(autoBuildHere(root, 0, { ...opts, runs: 3 })).toEqual(new Set([9840]));
  });
});
