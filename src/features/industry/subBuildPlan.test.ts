import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { resolveMaterial } from '@/engine/industry/materialResolution';
import {
  hasSubBuilds,
  materialTableRows,
  shoppingListMaterials,
  subBuildFeeTotal,
  subBuildSeconds,
} from './subBuildPlan';

const SEAL = 57478;
const FIBRE = 57457;
const RIVET = 57459;
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

const rivetBlueprint: IndustryBlueprint = {
  name: 'Rivet Blueprint',
  time: 900,
  materials: [{ typeID: FIBRE, quantity: 4 }],
  products: [{ typeID: RIVET, quantity: 2 }],
};

function recipeFor(map: Record<number, MaterialRecipe>) {
  return (typeID: number): MaterialRecipe | null => map[typeID] ?? null;
}

function resolve(
  entries: readonly { typeID: number; quantity: number }[],
  buildHere: number[],
  options: {
    recipes?: Record<number, MaterialRecipe>;
    materialPrices?: Record<number, number>;
    sourcing?: Record<number, { ownedQuantity?: number }>;
  } = {}
) {
  const recipes = options.recipes ?? {
    [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
  };
  const ownedPool = new Map<number, number>();
  return entries.map((entry) =>
    resolveMaterial(
      { typeID: entry.typeID, baseQuantity: entry.quantity, quantity: entry.quantity },
      {
        buildHere: new Set(buildHere),
        recipeFor: recipeFor(recipes),
        materialPrices: options.materialPrices ?? {},
        sourcing: options.sourcing,
        ctx: CTX,
        ownedPool,
      }
    )
  );
}

describe('materialTableRows', () => {
  it('is the plain material list, at depth 0, when nothing is built', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      []
    );

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => [r.typeID, r.depth])).toEqual([
      [SEAL, 0],
      [TRITANIUM, 0],
    ]);
    expect(rows.every((r) => !r.subBuild)).toBe(true);
  });

  it('follows a built material with its own recipe inputs, indented one level', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      [SEAL],
      { materialPrices: { [FIBRE]: 20 } }
    );

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => [r.typeID, r.depth])).toEqual([
      [SEAL, 0],
      [FIBRE, 1],
      [TRITANIUM, 0],
    ]);
    expect(rows[0].subBuild?.runs).toBe(50);
  });

  it('indents a second level when a recipe input is itself built', () => {
    const gearBlueprint: IndustryBlueprint = {
      name: 'Gear Blueprint',
      time: 300,
      materials: [{ typeID: TRITANIUM, quantity: 2 }],
      products: [{ typeID: FIBRE, quantity: 1 }],
    };
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL, FIBRE], {
      recipes: {
        [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
        [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
      },
      materialPrices: { [TRITANIUM]: 5 },
    });

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => [r.typeID, r.depth])).toEqual([
      [SEAL, 0],
      [FIBRE, 1],
      [TRITANIUM, 2],
    ]);
  });
});

describe('shoppingListMaterials', () => {
  it('lists every material unchanged when nothing is built', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      [],
      { materialPrices: { [SEAL]: 1, [TRITANIUM]: 1 } }
    );

    const list = shoppingListMaterials(resolved);
    expect(list.map((m) => m.typeID)).toEqual([SEAL, TRITANIUM]);
  });

  it('replaces a built material with what its recipe consumes', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL], {
      materialPrices: { [FIBRE]: 20 },
    });

    const list = shoppingListMaterials(resolved);
    expect(list.map((m) => m.typeID)).toEqual([FIBRE]);
    expect(list[0].quantity).toBe(500);
  });

  it('merges a recipe input shared by two different built materials into one line', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: RIVET, quantity: 20 },
      ],
      [SEAL, RIVET],
      {
        recipes: {
          [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
          [RIVET]: { method: 'manufacturing', blueprint: rivetBlueprint, me: 0 },
        },
        materialPrices: { [FIBRE]: 20 },
      }
    );

    const list = shoppingListMaterials(resolved);
    // 50 seal runs x 10 fibre, plus 10 rivet runs x 4 fibre.
    expect(list.map((m) => m.typeID)).toEqual([FIBRE]);
    expect(list[0].quantity).toBe(540);
  });

  it('folds a recipe input into the same material bought directly by the plan', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: FIBRE, quantity: 200 },
      ],
      [SEAL],
      { materialPrices: { [FIBRE]: 20 } }
    );

    const list = shoppingListMaterials(resolved);
    expect(list.map((m) => m.typeID)).toEqual([FIBRE]);
    expect(list[0].quantity).toBe(700);
  });

  it('never lists a planetary material’s inputs — a colony is not a job you can queue', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL], {
      recipes: {
        [SEAL]: {
          method: 'planetary',
          outputQuantity: 3,
          inputs: [{ typeID: FIBRE, quantity: 10 }],
        },
      },
    });

    const list = shoppingListMaterials(resolved);
    expect(list.map((m) => m.typeID)).toEqual([SEAL]);
  });
});

describe('subBuildFeeTotal / subBuildSeconds', () => {
  it('is zero when nothing is built', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], []);
    expect(subBuildFeeTotal(resolved)).toBe(0);
    expect(subBuildSeconds(resolved)).toBe(0);
  });

  it('adds up every level of the tree, not just the first', () => {
    const gearBlueprint: IndustryBlueprint = {
      name: 'Gear Blueprint',
      time: 300,
      materials: [{ typeID: TRITANIUM, quantity: 2 }],
      products: [{ typeID: FIBRE, quantity: 1 }],
    };
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL, FIBRE], {
      recipes: {
        [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
        [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
      },
      materialPrices: { [TRITANIUM]: 5 },
    });

    const sealFee = resolved[0].subBuild?.jobFee.total ?? 0;
    const fibreRow = resolved[0].subBuild?.inputs.find((i) => i.typeID === FIBRE);
    const fibreFee = fibreRow?.subBuild?.jobFee.total ?? 0;
    expect(subBuildFeeTotal(resolved)).toBeCloseTo(sealFee + fibreFee, 6);

    const sealSeconds = resolved[0].subBuild?.seconds ?? 0;
    const fibreSeconds = fibreRow?.subBuild?.seconds ?? 0;
    expect(subBuildSeconds(resolved)).toBeCloseTo(sealSeconds + fibreSeconds, 6);
  });
});

describe('hasSubBuilds', () => {
  it('is false when nothing is built and true once something is', () => {
    expect(hasSubBuilds(resolve([{ typeID: SEAL, quantity: 150 }], []))).toBe(false);
    expect(
      hasSubBuilds(
        resolve([{ typeID: SEAL, quantity: 150 }], [SEAL], { materialPrices: { [FIBRE]: 20 } })
      )
    ).toBe(true);
  });
});
