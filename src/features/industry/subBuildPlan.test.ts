import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint, MaterialCostLine } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { materialCostLines } from '@/engine/industry/sourcing';
import { expandBuildPlan, subBuildTableRows } from './subBuildPlan';

const SEAL = 57478;
const FIBRE = 57457;
const TRITANIUM = 34;

const CTX = {
  facility: FACILITY_PRESETS.npcStation,
  rig: 'none' as const,
  security: 'highsec' as const,
  systemCostIndex: 0.05,
  adjustedPrices: {},
  skills: {},
};

const sealBlueprint: IndustryBlueprint = {
  name: 'Seal Blueprint',
  time: 1800,
  materials: [{ typeID: FIBRE, quantity: 10 }],
  products: [{ typeID: SEAL, quantity: 3 }],
};

const RECIPES: Record<number, MaterialRecipe> = {
  [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
};

/** Plan materials, built through the engine so their shape cannot drift. */
function materials(
  entries: readonly { typeID: number; quantity: number }[],
  owned: Record<number, number> = {}
): MaterialCostLine[] {
  return materialCostLines(
    entries.map(({ typeID, quantity }) => ({ typeID, baseQuantity: quantity, quantity })),
    {},
    Object.fromEntries(Object.entries(owned).map(([id, q]) => [id, { ownedQuantity: q }]))
  );
}

function expand(
  lines: MaterialCostLine[],
  buildHere: number[],
  options: {
    recipes?: Record<number, MaterialRecipe>;
    hubPrices?: Record<number, number>;
    sourcing?: Record<number, { ownedQuantity?: number }>;
  } = {}
) {
  const recipes = options.recipes ?? RECIPES;
  return expandBuildPlan({
    materials: lines,
    buildHere,
    recipeFor: (typeID) => recipes[typeID] ?? null,
    hubPrices: options.hubPrices ?? {},
    sourcing: options.sourcing,
    ctx: CTX,
  });
}

describe('expandBuildPlan', () => {
  it('leaves the plan exactly as it was when nothing is expanded', () => {
    const lines = materials([{ typeID: SEAL, quantity: 150 }]);

    const expanded = expand(lines, []);

    expect(expanded.materials).toEqual(lines);
    expect(expanded.subBuilds.size).toBe(0);
    expect(expanded.subBuildFees).toBe(0);
  });

  it('swaps an expanded material for the inputs its recipe consumes', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }]), [SEAL]);

    // 150 seals at 3 a run is 50 runs, each eating 10 fibre.
    expect(expanded.subBuilds.get(SEAL)?.runs).toBe(50);
    expect(expanded.materials.map((m) => m.typeID)).toEqual([FIBRE]);
    expect(expanded.materials[0].quantity).toBe(500);
  });

  it('prices the swapped-in inputs against the hub, like any other material', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }]), [SEAL], {
      hubPrices: { [FIBRE]: 20 },
    });

    expect(expanded.materials[0].lineCost).toBe(10_000);
    expect(expanded.materialCost).toBe(10_000);
  });

  it('nets a swapped-in input against stock the plan already records for it', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }]), [SEAL], {
      hubPrices: { [FIBRE]: 20 },
      sourcing: { [FIBRE]: { ownedQuantity: 200 } },
    });

    expect(expanded.materials[0].remainingQuantity).toBe(300);
    expect(expanded.materialCost).toBe(6_000);
  });

  it('sizes the sub-job against what is still needed, so owned parents are not rebuilt', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }], { [SEAL]: 60 }), [SEAL]);

    expect(expanded.subBuilds.get(SEAL)?.needed).toBe(90);
    expect(expanded.subBuilds.get(SEAL)?.runs).toBe(30);
  });

  it('charges the sub-job installation fee separately from the materials', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }]), [SEAL], {
      hubPrices: { [FIBRE]: 20 },
    });

    expect(expanded.subBuildFees).toBe(expanded.subBuilds.get(SEAL)?.jobFee.total);
  });

  it('never expands a planetary material — a colony is not a job you can queue here', () => {
    const expanded = expand(materials([{ typeID: SEAL, quantity: 150 }]), [SEAL], {
      recipes: {
        [SEAL]: {
          method: 'planetary',
          outputQuantity: 3,
          inputs: [{ typeID: FIBRE, quantity: 10 }],
        },
      },
    });

    expect(expanded.subBuilds.size).toBe(0);
    expect(expanded.materials.map((m) => m.typeID)).toEqual([SEAL]);
  });

  it('ignores a request to expand a material nothing produces', () => {
    const expanded = expand(materials([{ typeID: TRITANIUM, quantity: 1000 }]), [TRITANIUM]);

    expect(expanded.subBuilds.size).toBe(0);
    expect(expanded.materials.map((m) => m.typeID)).toEqual([TRITANIUM]);
  });

  it('folds a recipe input into the same material bought directly by the parent plan', () => {
    const expanded = expand(
      materials([
        { typeID: SEAL, quantity: 150 },
        { typeID: FIBRE, quantity: 200 },
      ]),
      [SEAL]
    );

    expect(expanded.materials.map((m) => m.typeID)).toEqual([FIBRE]);
    expect(expanded.materials[0].quantity).toBe(700);
  });
});

describe('subBuildTableRows', () => {
  it('is the plain material list when nothing is expanded', () => {
    const lines = materials([
      { typeID: SEAL, quantity: 150 },
      { typeID: TRITANIUM, quantity: 1000 },
    ]);

    const rows = subBuildTableRows(lines, expand(lines, []));

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, TRITANIUM]);
    expect(rows.every((r) => !r.subBuild && !r.isSubInput)).toBe(true);
  });

  it('keeps an expanded material on screen, carrying the job that now produces it', () => {
    const lines = materials([{ typeID: SEAL, quantity: 150 }]);

    const rows = subBuildTableRows(lines, expand(lines, [SEAL]));

    expect(rows[0].typeID).toBe(SEAL);
    expect(rows[0].subBuild?.runs).toBe(50);
  });

  it('adds the recipe inputs after the plan’s own materials, marked as inputs', () => {
    const lines = materials([
      { typeID: SEAL, quantity: 150 },
      { typeID: TRITANIUM, quantity: 1000 },
    ]);

    const rows = subBuildTableRows(lines, expand(lines, [SEAL]));

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, TRITANIUM, FIBRE]);
    expect(rows[2].isSubInput).toBe(true);
    expect(rows[2].quantity).toBe(500);
  });

  it('never indents an input the plan already buys — it joins that row instead', () => {
    const lines = materials([
      { typeID: SEAL, quantity: 150 },
      { typeID: FIBRE, quantity: 200 },
    ]);

    const rows = subBuildTableRows(lines, expand(lines, [SEAL]));

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, FIBRE]);
    expect(rows[1].isSubInput).toBeUndefined();
    // 200 bought outright plus the 500 the seal job now needs.
    expect(rows[1].quantity).toBe(700);
  });
});
