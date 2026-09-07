import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type {
  EffectiveMaterial,
  IndustryBlueprint,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import {
  MAX_SUB_BUILD_DEPTH,
  resolveMaterial,
  unpricedLeafTypeIds,
  type ResolveMaterialOptions,
} from './materialResolution';

const CTX = {
  facility: FACILITY_PRESETS.npcStation,
  rig: 'none' as const,
  security: 'highsec' as const,
  systemCostIndex: 0.05,
  adjustedPrices: {} as Record<number, number>,
  skills: {} as Record<number, number>,
};

// A four-blueprint chain: PARENT (top-level material) is built from MID, MID
// from LEAF, and LEAF from ROOT — a plain market mineral. Shaped so a test
// can choose, per case, how deep `buildHere` reaches, up to all four levels.
const PARENT_TYPE = 100;
const MID_TYPE = 200;
const LEAF_TYPE = 300;
const ROOT_TYPE = 500;
const UNPRICEABLE_TYPE = 400;

const parentBlueprint: IndustryBlueprint = {
  name: 'Parent Blueprint',
  time: 1000,
  materials: [{ typeID: MID_TYPE, quantity: 2 }],
  products: [{ typeID: PARENT_TYPE, quantity: 1 }],
};

const midBlueprint: IndustryBlueprint = {
  name: 'Mid Blueprint',
  time: 500,
  materials: [{ typeID: LEAF_TYPE, quantity: 5 }],
  products: [{ typeID: MID_TYPE, quantity: 1 }],
};

const leafBlueprint: IndustryBlueprint = {
  name: 'Leaf Blueprint',
  time: 250,
  materials: [{ typeID: ROOT_TYPE, quantity: 3 }],
  products: [{ typeID: LEAF_TYPE, quantity: 1 }],
};

const midBlueprintWithUnpriceableInput: IndustryBlueprint = {
  name: 'Mid Blueprint (poisoned)',
  time: 500,
  materials: [{ typeID: UNPRICEABLE_TYPE, quantity: 1 }],
  products: [{ typeID: MID_TYPE, quantity: 1 }],
};

function recipeFor(map: Record<number, MaterialRecipe>) {
  return (typeID: number): MaterialRecipe | null => map[typeID] ?? null;
}

function baseOptions(overrides: Partial<ResolveMaterialOptions> = {}): ResolveMaterialOptions {
  return {
    buildHere: new Set<number>(),
    recipeFor: () => null,
    materialPrices: {},
    sourcing: undefined,
    ctx: CTX,
    ...overrides,
  };
}

const material = (typeID: number, quantity: number): EffectiveMaterial => ({
  typeID,
  baseQuantity: quantity,
  quantity,
});

describe('resolveMaterial — bought leaf (no buildHere, or nothing produces it)', () => {
  it('prices a plain material at the hub, matching the flat sourcing.ts behaviour', () => {
    const resolved = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({
        materialPrices: { [LEAF_TYPE]: 50 },
      })
    );

    expect(resolved).toMatchObject({
      unitPrice: 50,
      remainingQuantity: 10,
      lineCost: 500,
      unpriced: false,
    });
    expect(resolved.subBuild).toBeUndefined();
  });

  it('flags a material with no hub price and no override as unpriced, cost 0', () => {
    const resolved = resolveMaterial(material(LEAF_TYPE, 10), baseOptions());

    expect(resolved.unitPrice).toBeNull();
    expect(resolved.lineCost).toBe(0);
    expect(resolved.unpriced).toBe(true);
  });

  it('is never a blocker once fully owned, even with no hub price at all', () => {
    const resolved = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({ sourcing: { [LEAF_TYPE]: { ownedQuantity: 10 } } })
    );

    expect(resolved.remainingQuantity).toBe(0);
    expect(resolved.lineCost).toBe(0);
    expect(resolved.unpriced).toBe(false);
  });

  it('does not build a material in buildHere when nothing produces it', () => {
    const resolved = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({ buildHere: new Set([LEAF_TYPE]), materialPrices: { [LEAF_TYPE]: 50 } })
    );

    expect(resolved.subBuild).toBeUndefined();
    expect(resolved.unitPrice).toBe(50);
  });
});

describe('resolveMaterial — one level of build', () => {
  it('replaces the market price with the rolled-up cost of the job that makes it', () => {
    const resolved = resolveMaterial(
      material(MID_TYPE, 10),
      baseOptions({
        buildHere: new Set([MID_TYPE]),
        recipeFor: recipeFor({
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
        }),
        materialPrices: { [LEAF_TYPE]: 100, [MID_TYPE]: 999_999 }, // MID's own market price must be ignored once built
        ctx: { ...CTX, adjustedPrices: { [LEAF_TYPE]: 100 } },
      })
    );

    expect(resolved.subBuild).toBeDefined();
    expect(resolved.unitPrice).toBeNull();
    // 10 units needed at 1/run -> 10 runs -> 50 units of LEAF at 100 = 5000 materials.
    expect(resolved.subBuild?.materialCost).toBe(5000);
    expect(resolved.subBuild?.totalFees).toBeGreaterThan(0);
    expect(resolved.subBuild?.totalCost).toBe(
      (resolved.subBuild?.materialCost ?? 0) + (resolved.subBuild?.totalFees ?? 0)
    );
    // unitCost x unitsMade (10) reproduces the job's total cost.
    expect((resolved.subBuild?.unitCost ?? 0) * 10).toBeCloseTo(
      resolved.subBuild?.totalCost ?? 0,
      6
    );
    expect(resolved.lineCost).toBeCloseTo(10 * (resolved.subBuild?.unitCost ?? 0), 6);
    expect(resolved.unpriced).toBe(false);
  });

  it('sizes the job against what owned stock leaves outstanding, not the full requirement', () => {
    const resolved = resolveMaterial(
      material(MID_TYPE, 10),
      baseOptions({
        buildHere: new Set([MID_TYPE]),
        recipeFor: recipeFor({
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
        }),
        materialPrices: { [LEAF_TYPE]: 100 },
        sourcing: { [MID_TYPE]: { ownedQuantity: 4 } },
      })
    );

    expect(resolved.subBuild?.needed).toBe(6);
  });
});

describe('resolveMaterial — recursion', () => {
  it('builds several levels deep when every level is in buildHere', () => {
    const resolved = resolveMaterial(
      material(PARENT_TYPE, 3),
      baseOptions({
        buildHere: new Set([PARENT_TYPE, MID_TYPE]),
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprint, me: 0 },
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
        }),
        materialPrices: { [LEAF_TYPE]: 10 },
      })
    );

    // 3 PARENT -> 3 runs -> 6 MID needed -> 6 runs -> 30 LEAF at 10 = 300.
    const midRow = resolved.subBuild?.inputs.find((i) => i.typeID === MID_TYPE);
    expect(midRow?.subBuild).toBeDefined();
    expect(midRow?.subBuild?.needed).toBe(6);
    expect(midRow?.subBuild?.materialCost).toBe(300);
    // The parent's own rolled cost embeds MID's total (materials + its own fee).
    expect(resolved.subBuild?.materialCost).toBeCloseTo(6 * (midRow?.subBuild?.unitCost ?? 0), 6);
    expect(resolved.unpriced).toBe(false);
  });

  it('builds four levels deep — PARENT, MID, LEAF and ROOT — exactly as far as the recipe tree and buildHere reach', () => {
    const resolved = resolveMaterial(
      material(PARENT_TYPE, 1),
      baseOptions({
        buildHere: new Set([PARENT_TYPE, MID_TYPE, LEAF_TYPE]),
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprint, me: 0 },
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
          [LEAF_TYPE]: { method: 'manufacturing', blueprint: leafBlueprint, me: 0 },
        }),
        materialPrices: { [ROOT_TYPE]: 2 },
      })
    );

    // 1 PARENT -> 2 MID -> 10 LEAF -> 30 ROOT at 2 ISK = 60.
    const midRow = resolved.subBuild?.inputs.find((i) => i.typeID === MID_TYPE);
    const leafRow = midRow?.subBuild?.inputs.find((i) => i.typeID === LEAF_TYPE);
    const rootRow = leafRow?.subBuild?.inputs.find((i) => i.typeID === ROOT_TYPE);

    expect(midRow?.subBuild).toBeDefined();
    expect(leafRow?.subBuild).toBeDefined();
    expect(rootRow?.subBuild).toBeUndefined(); // ROOT bottoms out — bought, not built
    expect(rootRow?.remainingQuantity).toBe(30);
    expect(rootRow?.lineCost).toBe(60);

    // Every level's rolled-up cost is unpoisoned and non-zero, all the way up.
    expect(leafRow?.subBuild?.unitCost).not.toBeNull();
    expect(midRow?.subBuild?.unitCost).not.toBeNull();
    expect(resolved.subBuild?.unitCost).not.toBeNull();
    expect(resolved.unpriced).toBe(false);
  });

  it('stops at a material not itself marked to build, even if something could produce it', () => {
    const resolved = resolveMaterial(
      material(PARENT_TYPE, 3),
      baseOptions({
        buildHere: new Set([PARENT_TYPE]), // MID is not chosen — buy it at the hub
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprint, me: 0 },
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
        }),
        materialPrices: { [MID_TYPE]: 40 },
      })
    );

    const midRow = resolved.subBuild?.inputs.find((i) => i.typeID === MID_TYPE);
    expect(midRow?.subBuild).toBeUndefined();
    expect(midRow?.unitPrice).toBe(40);
  });
});

describe('resolveMaterial — a poisoned leaf blocks every ancestor honestly', () => {
  it('propagates "unpriced" up through a built branch instead of silently costing it as free', () => {
    const resolved = resolveMaterial(
      material(MID_TYPE, 10),
      baseOptions({
        buildHere: new Set([MID_TYPE]),
        recipeFor: recipeFor({
          [MID_TYPE]: {
            method: 'manufacturing',
            blueprint: midBlueprintWithUnpriceableInput,
            me: 0,
          },
        }),
        materialPrices: {}, // UNPRICEABLE_TYPE has no hub listing and no recipe
      })
    );

    expect(resolved.subBuild?.unitCost).toBeNull();
    // Poisoned, not free: the line must not silently read as a real 0-ISK cost.
    expect(resolved.unpriced).toBe(true);
    expect(resolved.lineCost).toBe(0);
  });

  it('the same poison reaches a grandparent two levels up', () => {
    const resolved = resolveMaterial(
      material(PARENT_TYPE, 3),
      baseOptions({
        buildHere: new Set([PARENT_TYPE, MID_TYPE]),
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprint, me: 0 },
          [MID_TYPE]: {
            method: 'manufacturing',
            blueprint: midBlueprintWithUnpriceableInput,
            me: 0,
          },
        }),
        materialPrices: {},
      })
    );

    expect(resolved.unpriced).toBe(true);
    expect(resolved.subBuild?.unitCost).toBeNull();
  });
});

describe('unpricedLeafTypeIds', () => {
  it('reports a bought material’s own typeID', () => {
    const resolved = resolveMaterial(material(LEAF_TYPE, 10), baseOptions());
    expect(unpricedLeafTypeIds([resolved])).toEqual([LEAF_TYPE]);
  });

  it('reports the real deep culprit, never a built material’s own typeID standing in for it', () => {
    const resolved = resolveMaterial(
      material(PARENT_TYPE, 3),
      baseOptions({
        buildHere: new Set([PARENT_TYPE, MID_TYPE]),
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprint, me: 0 },
          [MID_TYPE]: {
            method: 'manufacturing',
            blueprint: midBlueprintWithUnpriceableInput,
            me: 0,
          },
        }),
        materialPrices: {},
      })
    );

    // PARENT and MID are both built and both poisoned, but neither is what
    // actually lacks a price — UNPRICEABLE_TYPE, two levels down, is.
    expect(unpricedLeafTypeIds([resolved])).toEqual([UNPRICEABLE_TYPE]);
  });

  it('is empty when nothing is unpriced', () => {
    const resolved = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({ materialPrices: { [LEAF_TYPE]: 5 } })
    );
    expect(unpricedLeafTypeIds([resolved])).toEqual([]);
  });
});

describe('resolveMaterial — owned stock is one pool for the whole tree', () => {
  it('does not credit the same physical stock to two different branches that both consume it', () => {
    // Two unrelated top-level materials, SECOND_PARENT and PARENT, each built
    // from their own MID-shaped job that in turn eats LEAF_TYPE — and only
    // 20 LEAF_TYPE is actually owned, less than either branch alone needs.
    const secondParentType = 101;
    const secondParentBlueprint: IndustryBlueprint = {
      name: 'Second Parent Blueprint',
      time: 1000,
      materials: [{ typeID: LEAF_TYPE, quantity: 30 }],
      products: [{ typeID: secondParentType, quantity: 1 }],
    };
    const parentBlueprintDirect: IndustryBlueprint = {
      name: 'Parent Blueprint (direct leaf)',
      time: 1000,
      materials: [{ typeID: LEAF_TYPE, quantity: 30 }],
      products: [{ typeID: PARENT_TYPE, quantity: 1 }],
    };

    const ownedPool = new Map<number, number>();
    const opts = baseOptions({
      buildHere: new Set([PARENT_TYPE, secondParentType]),
      recipeFor: recipeFor({
        [PARENT_TYPE]: { method: 'manufacturing', blueprint: parentBlueprintDirect, me: 0 },
        [secondParentType]: { method: 'manufacturing', blueprint: secondParentBlueprint, me: 0 },
      }),
      materialPrices: { [LEAF_TYPE]: 10 },
      sourcing: { [LEAF_TYPE]: { ownedQuantity: 20 } },
      ownedPool,
    });

    const first = resolveMaterial(material(PARENT_TYPE, 1), opts);
    const second = resolveMaterial(material(secondParentType, 1), opts);

    const firstLeaf = first.subBuild?.inputs.find((i) => i.typeID === LEAF_TYPE);
    const secondLeaf = second.subBuild?.inputs.find((i) => i.typeID === LEAF_TYPE);
    // 20 owned total, split across the two branches, never 20 credited to each.
    expect((firstLeaf?.ownedQuantity ?? 0) + (secondLeaf?.ownedQuantity ?? 0)).toBe(20);
    expect(firstLeaf?.ownedQuantity).toBe(20);
    expect(secondLeaf?.ownedQuantity).toBe(0);
    expect(secondLeaf?.remainingQuantity).toBe(30);
  });

  it('without a shared pool (a caller resolving one material in isolation), each call gets its own fresh stock', () => {
    const resolved = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({ sourcing: { [LEAF_TYPE]: { ownedQuantity: 10 } } })
    );
    const resolvedAgain = resolveMaterial(
      material(LEAF_TYPE, 10),
      baseOptions({ sourcing: { [LEAF_TYPE]: { ownedQuantity: 10 } } })
    );
    expect(resolved.ownedQuantity).toBe(10);
    expect(resolvedAgain.ownedQuantity).toBe(10);
  });
});

describe('resolveMaterial — cycle and depth guards', () => {
  it('refuses to build a material that is already an ancestor of itself on this branch', () => {
    const selfBlueprint: IndustryBlueprint = {
      name: 'Ouroboros Blueprint',
      time: 100,
      materials: [{ typeID: PARENT_TYPE, quantity: 1 }],
      products: [{ typeID: PARENT_TYPE, quantity: 1 }],
    };

    const resolved = resolveMaterial(
      material(PARENT_TYPE, 5),
      baseOptions({
        buildHere: new Set([PARENT_TYPE]),
        recipeFor: recipeFor({
          [PARENT_TYPE]: { method: 'manufacturing', blueprint: selfBlueprint, me: 0 },
        }),
        materialPrices: { [PARENT_TYPE]: 7 },
      })
    );

    // One level of the job plans fine; its own PARENT_TYPE input must not
    // recurse into a second job and instead falls back to being bought.
    expect(resolved.subBuild).toBeDefined();
    const innerParent = resolved.subBuild?.inputs.find((i) => i.typeID === PARENT_TYPE);
    expect(innerParent?.subBuild).toBeUndefined();
    expect(innerParent?.unitPrice).toBe(7);
  });

  it('stops recursing past MAX_SUB_BUILD_DEPTH and buys the material instead', () => {
    const resolved = resolveMaterial(material(MID_TYPE, 10), {
      buildHere: new Set([MID_TYPE]),
      recipeFor: recipeFor({
        [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 0 },
      }),
      materialPrices: { [LEAF_TYPE]: 100 },
      sourcing: undefined,
      ctx: CTX,
      depth: MAX_SUB_BUILD_DEPTH,
    });

    expect(resolved.subBuild).toBeUndefined();
    expect(resolved.unitPrice).toBeNull(); // MID has no hub price of its own in this test
  });
});

describe('resolveMaterial — never throws on bad blueprint/ME data', () => {
  it('falls back to buying the material when the recipe is out of the engine range', () => {
    const resolved = resolveMaterial(
      material(MID_TYPE, 10),
      baseOptions({
        buildHere: new Set([MID_TYPE]),
        recipeFor: recipeFor({
          [MID_TYPE]: { method: 'manufacturing', blueprint: midBlueprint, me: 99 },
        }),
        materialPrices: { [MID_TYPE]: 42 },
      })
    );

    expect(resolved.subBuild).toBeUndefined();
    expect(resolved.unitPrice).toBe(42);
  });

  const sourcingMap: MaterialSourcingMap | undefined = undefined;
  it('accepts an undefined sourcing map without throwing', () => {
    expect(() =>
      resolveMaterial(material(LEAF_TYPE, 1), baseOptions({ sourcing: sourcingMap }))
    ).not.toThrow();
  });
});
