import { describe, it, expect, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import {
  autoBuildHere,
  facilityContextForNode,
  maxAutoBuildDepth,
} from '@/engine/industry/autoMakeOrBuy';
import { makeOrBuy, type MakeOrBuyContext, type MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { effectiveMaterials } from '@/engine/industry/materials';
import { MAX_SUB_BUILD_DEPTH } from '@/engine/industry/materialResolution';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { HubPrices, IndustryBlueprint } from '@/engine/industry/types';

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
  modifiers: NO_CHARACTER_MODIFIERS,
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

  it('walks past the old Build Opportunities 0-3 UI range once that control is removed', () => {
    const result = autoBuildHere(productBlueprint, 0, { recipeFor, ctx, depth: 99, runs: 1 });
    expect(result).toEqual(new Set([502, 501, 500, 499]));
  });

  it('bounds an unbounded requested depth at MAX_SUB_BUILD_DEPTH', () => {
    const chainLength = MAX_SUB_BUILD_DEPTH + 2;
    const ids = Array.from({ length: chainLength }, (_, i) => 9000 + i);
    const chainRecipes: Record<number, MaterialRecipe> = {};
    const materialPrices: HubPrices = { 34: 1 };
    const adjustedPrices: HubPrices = { 34: 1 };
    for (let i = 0; i < chainLength; i++) {
      const id = ids[i]!;
      const nextTypeID = i + 1 < chainLength ? ids[i + 1]! : 34;
      const bp: IndustryBlueprint = {
        name: `Chain ${i}`,
        time: 1,
        materials: [{ typeID: nextTypeID, quantity: 1 }],
        products: [{ typeID: id, quantity: 1 }],
      };
      chainRecipes[id] = { method: 'manufacturing', blueprint: bp, me: 0 };
      materialPrices[id] = (chainLength - i) * 1_000_000_000;
      adjustedPrices[id] = 1;
    }
    const root: IndustryBlueprint = {
      name: 'Chain Root',
      time: 1,
      materials: [{ typeID: ids[0]!, quantity: 1 }],
      products: [{ typeID: 99999, quantity: 1 }],
    };
    const chainCtx: MakeOrBuyContext = { ...ctx, materialPrices, adjustedPrices };
    const result = autoBuildHere(root, 0, {
      recipeFor: (id) => chainRecipes[id] ?? null,
      ctx: chainCtx,
      depth: 9999,
      runs: 1,
    });
    expect(result.size).toBe(MAX_SUB_BUILD_DEPTH);
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

  it('never auto-builds a reaction or planetary material, even when cheaper, within the default manufacturing-only Craft Scope', () => {
    const reactionRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'reaction', blueprint: gearABlueprint },
    };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => reactionRecipes[id] ?? null,
      ctx,
      depth: 1,
      runs: 1,
    });
    expect(result.size).toBe(0);
  });

  it("does not dead-end on a reaction material outside Craft Scope — it keeps walking into that recipe's own inputs", () => {
    const reactionRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'reaction', blueprint: gearABlueprint },
      501: { method: 'manufacturing', blueprint: gearBBlueprint, me: 0 },
    };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => reactionRecipes[id] ?? null,
      ctx,
      depth: 2,
      runs: 1,
    });
    expect(result).toEqual(new Set([501]));
  });

  it("does not dead-end on a planetary material outside Craft Scope — it keeps walking into that schematic's own inputs", () => {
    const planetaryRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'planetary', outputQuantity: 5, inputs: [{ typeID: 501, quantity: 4 }] },
      501: { method: 'manufacturing', blueprint: gearBBlueprint, me: 0 },
    };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => planetaryRecipes[id] ?? null,
      ctx,
      depth: 2,
      runs: 1,
    });
    expect(result).toEqual(new Set([501]));
  });

  it("'build' Build Strategy forces every Craft-Scope-eligible material buildable, bypassing the cost compare", () => {
    const dear: MakeOrBuyContext = { ...ctx, materialPrices: { ...ctx.materialPrices, 502: 1 } };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor,
      ctx: dear,
      depth: 1,
      runs: 1,
      strategy: 'build',
    });
    expect(result).toEqual(new Set([502]));
  });

  it("'buy' Build Strategy forces every Craft-Scope-eligible material to buy, even when building is cheaper", () => {
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor,
      ctx,
      depth: 3,
      runs: 1,
      strategy: 'buy',
    });
    expect(result.size).toBe(0);
  });

  it("'build' Build Strategy still respects Craft Scope — a reaction material stays excluded but its inputs are still reached", () => {
    const reactionRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'reaction', blueprint: gearABlueprint },
      501: { method: 'manufacturing', blueprint: gearBBlueprint, me: 0 },
    };
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => reactionRecipes[id] ?? null,
      ctx,
      depth: 2,
      runs: 1,
      strategy: 'build',
      scope: ['manufacturing'],
    });
    expect(result).toEqual(new Set([501]));
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

  it('excludes a material nobody on the account can build (issue #1231), even though building is cheaper — ending the branch the same way an ordinary cost-based buy verdict does', () => {
    const gatedGearABlueprint: IndustryBlueprint = {
      ...gearABlueprint,
      skills: [{ typeID: 3380, level: 5 }],
    };
    const gatedRecipes: Record<number, MaterialRecipe> = {
      ...recipes,
      502: { method: 'manufacturing', blueprint: gatedGearABlueprint, me: 0 },
    };
    const noAccountSkills = new Map([[1, {}]]);
    const result = autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => gatedRecipes[id] ?? null,
      ctx: { ...ctx, accountSkills: noAccountSkills },
      depth: 2,
      runs: 1,
    });
    expect(result.size).toBe(0);
  });

  it('calls onSkillGated for a material it forced to buy, and says why (issue #1231)', () => {
    const gatedGearABlueprint: IndustryBlueprint = {
      ...gearABlueprint,
      skills: [{ typeID: 3380, level: 5 }],
    };
    const gatedRecipes: Record<number, MaterialRecipe> = {
      ...recipes,
      502: { method: 'manufacturing', blueprint: gatedGearABlueprint, me: 0 },
    };
    const noAccountSkills = new Map([[1, {}]]);
    const onSkillGated = vi.fn();
    autoBuildHere(productBlueprint, 0, {
      recipeFor: (id) => gatedRecipes[id] ?? null,
      ctx: { ...ctx, accountSkills: noAccountSkills },
      depth: 2,
      runs: 1,
      onSkillGated,
    });
    expect(onSkillGated).toHaveBeenCalledTimes(1);
    expect(onSkillGated).toHaveBeenCalledWith(502, {
      gated: true,
      shortfall: [{ typeID: 3380, haveLevel: 0, needLevel: 5 }],
      bestCharacterId: 1,
    });
  });

  it('never calls onSkillGated for an ordinary cost-based buy', () => {
    const dear: MakeOrBuyContext = { ...ctx, materialPrices: { ...ctx.materialPrices, 502: 1 } };
    const onSkillGated = vi.fn();
    autoBuildHere(productBlueprint, 0, { recipeFor, ctx: dear, depth: 3, runs: 1, onSkillGated });
    expect(onSkillGated).not.toHaveBeenCalled();
  });

  it("sizes the root job to the plan's real runs, not always 1 — a verdict decided at the wrong scale would disagree with what the recursive engine later bills", () => {
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
      modifiers: NO_CHARACTER_MODIFIERS,
    };

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

    const ctx: MakeOrBuyContext = {
      ...riggedCtx,
      materialPrices: { ...riggedCtx.materialPrices, 9840: (at1Run + at3Runs) / 2 },
    };
    const opts = { recipeFor: (id: number) => (id === 9840 ? recipe : null), ctx, depth: 1 };
    expect(autoBuildHere(root, 0, { ...opts, runs: 1 })).toEqual(new Set());
    expect(autoBuildHere(root, 0, { ...opts, runs: 3 })).toEqual(new Set([9840]));
  });
});

describe('maxAutoBuildDepth', () => {
  it('is 0 for a product whose materials are all raw (nothing has a recipe)', () => {
    const mined: IndustryBlueprint = {
      ...productBlueprint,
      materials: [{ typeID: 34, quantity: 10 }],
    };
    expect(maxAutoBuildDepth(mined, 0, { recipeFor, ctx, runs: 1 })).toBe(0);
  });

  it("reaches the full depth of the product's real material chain", () => {
    expect(maxAutoBuildDepth(productBlueprint, 0, { recipeFor, ctx, runs: 1 })).toBe(4);
  });

  it('is capped at MAX_SUB_BUILD_DEPTH for a chain deeper than the safety valve', () => {
    const chainLength = MAX_SUB_BUILD_DEPTH + 2;
    const ids = Array.from({ length: chainLength }, (_, i) => 9000 + i);
    const chainRecipes: Record<number, MaterialRecipe> = {};
    for (let i = 0; i < chainLength; i++) {
      const id = ids[i]!;
      const nextTypeID = i + 1 < chainLength ? ids[i + 1]! : 34;
      const bp: IndustryBlueprint = {
        name: `Chain ${i}`,
        time: 1,
        materials: [{ typeID: nextTypeID, quantity: 1 }],
        products: [{ typeID: id, quantity: 1 }],
      };
      chainRecipes[id] = { method: 'manufacturing', blueprint: bp, me: 0 };
    }
    const root: IndustryBlueprint = {
      name: 'Chain Root',
      time: 1,
      materials: [{ typeID: ids[0]!, quantity: 1 }],
      products: [{ typeID: 99999, quantity: 1 }],
    };
    const result = maxAutoBuildDepth(root, 0, {
      recipeFor: (id) => chainRecipes[id] ?? null,
      ctx,
      runs: 1,
    });
    expect(result).toBe(MAX_SUB_BUILD_DEPTH);
  });

  it('does not dead-end on a material outside Craft Scope — depth-discovery ignores scope entirely', () => {
    const reactionRecipes: Record<number, MaterialRecipe> = {
      502: { method: 'reaction', blueprint: gearABlueprint },
      501: { method: 'manufacturing', blueprint: gearBBlueprint, me: 0 },
    };
    const result = maxAutoBuildDepth(productBlueprint, 0, {
      recipeFor: (id) => reactionRecipes[id] ?? null,
      ctx,
      runs: 1,
    });
    expect(result).toBe(2);
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
    expect(() => maxAutoBuildDepth(root, 0, { recipeFor: cyclic, ctx, runs: 1 })).not.toThrow();
  });
});

describe('facilityContextForNode (issue #698)', () => {
  const reactionFacility = {
    facility: FACILITY_PRESETS.athanor,
    rigFit: ['meT2', 'none', 'none'] as const,
    security: 'highsec' as const,
    systemCostIndex: 0.1,
  };

  it('uses the Reaction Location for a reaction node, when one is configured', () => {
    expect(facilityContextForNode('reaction', { ...ctx, reactionFacility })).toBe(reactionFacility);
  });

  it("falls back to the plan's own ctx for a reaction node with no Reaction Location — a reaction-activity plan reuses its own facility", () => {
    expect(facilityContextForNode('reaction', ctx)).toBe(ctx);
  });

  it('never uses the Reaction Location for a manufacturing node, even when one is configured', () => {
    const withReactionFacility = { ...ctx, reactionFacility };
    expect(facilityContextForNode('manufacturing', withReactionFacility)).toBe(
      withReactionFacility
    );
  });
});
