import { describe, it, expect } from 'vitest';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryBlueprint } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { resolveMaterial } from '@/engine/industry/materialResolution';
import {
  buildRecipe,
  hasSubBuilds,
  materialTableRows,
  shoppingListMaterials,
  subBuildSeconds,
} from './subBuildPlan';

const SEAL = 57478;
const FIBRE = 57457;
const RIVET = 57459;
const TRITANIUM = 34;

const CTX = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'] as const,
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

/** A rivet made out of seals, so one typeID ends up built by two different jobs. */
const rivetFromSealBlueprint: IndustryBlueprint = {
  name: 'Rivet Blueprint',
  time: 900,
  materials: [{ typeID: SEAL, quantity: 4 }],
  products: [{ typeID: RIVET, quantity: 2 }],
};

const gearBlueprint: IndustryBlueprint = {
  name: 'Gear Blueprint',
  time: 300,
  materials: [{ typeID: TRITANIUM, quantity: 2 }],
  products: [{ typeID: FIBRE, quantity: 1 }],
};

describe('materialTableRows', () => {
  it('is the plain material list when nothing is built', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      []
    );

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, TRITANIUM]);
    expect(rows.every((r) => r.subBuilds.length === 0)).toBe(true);
  });

  it('keeps a built material as a row and adds its inputs to the same flat list', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      [SEAL],
      { materialPrices: { [FIBRE]: 20 } }
    );

    const rows = materialTableRows(resolved);

    // The plan's own materials in blueprint order, then what the recipes
    // introduced — never an input wedged between two blueprint materials.
    expect(rows.map((r) => r.typeID)).toEqual([SEAL, TRITANIUM, FIBRE]);
    expect(rows[0].subBuilds.map((s) => s.runs)).toEqual([50]);
    expect(rows[2].quantity).toBe(500);
  });

  it('lists a recipe input shared by two built materials once, with the quantities summed', () => {
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

    const rows = materialTableRows(resolved);

    // 50 seal runs x 10 fibre, plus 10 rivet runs x 4 fibre — one row, not two.
    expect(rows.map((r) => r.typeID)).toEqual([SEAL, RIVET, FIBRE]);
    expect(rows[2].quantity).toBe(540);
  });

  it('folds a recipe input into the same row the plan already buys directly', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: FIBRE, quantity: 200 },
      ],
      [SEAL],
      { materialPrices: { [FIBRE]: 20 } }
    );

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, FIBRE]);
    expect(rows[1].quantity).toBe(700);
    expect(rows[1].lineCost).toBe(700 * 20);
  });

  it('flattens a nested build too — depth never becomes another row for the same type', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: TRITANIUM, quantity: 1000 },
      ],
      [SEAL, FIBRE],
      {
        recipes: {
          [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
          [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
        },
        materialPrices: { [TRITANIUM]: 5 },
      }
    );

    const rows = materialTableRows(resolved);

    expect(rows.map((r) => r.typeID)).toEqual([SEAL, TRITANIUM, FIBRE]);
    // The plan's own 1,000 plus the 1,000 the fibre job eats (500 fibre x 2).
    expect(rows[1].quantity).toBe(2000);
  });

  it('gathers every job that produces one material onto that material’s single row', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: RIVET, quantity: 20 },
      ],
      [SEAL, RIVET],
      {
        recipes: {
          [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
          [RIVET]: { method: 'manufacturing', blueprint: rivetFromSealBlueprint, me: 0 },
        },
        materialPrices: { [FIBRE]: 20 },
      }
    );

    const rows = materialTableRows(resolved);
    const seal = rows.find((r) => r.typeID === SEAL);

    // Built twice: 150 for the plan itself, 40 more for the rivet job.
    expect(seal?.quantity).toBe(190);
    expect(seal?.subBuilds.map((s) => s.runs)).toEqual([50, 14]);
  });

  it('never repeats a typeID — the table keys its rows by one', () => {
    const resolved = resolve(
      [
        { typeID: SEAL, quantity: 150 },
        { typeID: RIVET, quantity: 20 },
        { typeID: FIBRE, quantity: 200 },
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

    const ids = materialTableRows(resolved).map((r) => r.typeID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildRecipe', () => {
  it('is null for a material that is bought rather than built', () => {
    const rows = materialTableRows(resolve([{ typeID: SEAL, quantity: 150 }], []));
    expect(buildRecipe(rows[0])).toBeNull();
  });

  it('states the job that covers the quantity, and what it consumes', () => {
    const rows = materialTableRows(
      resolve([{ typeID: SEAL, quantity: 100 }], [SEAL], { materialPrices: { [FIBRE]: 20 } })
    );

    const recipe = buildRecipe(rows[0]);

    // 3 seals a run, so 34 runs to cover 100 — two spare.
    expect(recipe).toMatchObject({
      typeID: SEAL,
      runs: 34,
      outputPerRun: 3,
      unitsMade: 102,
      needed: 100,
      spare: 2,
    });
    expect(recipe?.inputs.map((i) => [i.typeID, i.quantity])).toEqual([[FIBRE, 340]]);
  });

  it('sums every job producing the material, and merges what they consume', () => {
    const rows = materialTableRows(
      resolve(
        [
          { typeID: SEAL, quantity: 150 },
          { typeID: RIVET, quantity: 20 },
        ],
        [SEAL, RIVET],
        {
          recipes: {
            [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
            [RIVET]: { method: 'manufacturing', blueprint: rivetFromSealBlueprint, me: 0 },
          },
          materialPrices: { [FIBRE]: 20 },
        }
      )
    );

    const recipe = buildRecipe(rows.find((r) => r.typeID === SEAL)!);

    expect(recipe).toMatchObject({ runs: 64, unitsMade: 192, needed: 190, spare: 2 });
    // 50 runs x 10 fibre plus 14 runs x 10 fibre, on one line.
    expect(recipe?.inputs.map((i) => [i.typeID, i.quantity])).toEqual([[FIBRE, 640]]);
  });

  it('flags an input that is itself being built, so the modal can offer its recipe', () => {
    const rows = materialTableRows(
      resolve([{ typeID: SEAL, quantity: 150 }], [SEAL, FIBRE], {
        recipes: {
          [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
          [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
        },
        materialPrices: { [TRITANIUM]: 5 },
      })
    );

    const recipe = buildRecipe(rows.find((r) => r.typeID === SEAL)!);
    expect(recipe?.inputs.map((i) => [i.typeID, i.built])).toEqual([[FIBRE, true]]);
  });

  it('counts only these jobs’ own fees — a descendant job has its own row and its own fee', () => {
    const rows = materialTableRows(
      resolve([{ typeID: SEAL, quantity: 150 }], [SEAL, FIBRE], {
        recipes: {
          [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
          [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
        },
        materialPrices: { [TRITANIUM]: 5 },
      })
    );

    const seal = rows.find((r) => r.typeID === SEAL)!;
    expect(buildRecipe(seal)?.jobFees).toBeCloseTo(seal.subBuilds[0].jobFee.total, 6);
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

describe('subBuildSeconds', () => {
  it('is zero when nothing is built', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], []);
    expect(subBuildSeconds(resolved)).toBe(0);
  });

  it('adds up every level of the tree, not just the first', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL, FIBRE], {
      recipes: {
        [SEAL]: { method: 'manufacturing', blueprint: sealBlueprint, me: 0 },
        [FIBRE]: { method: 'manufacturing', blueprint: gearBlueprint, me: 0 },
      },
      materialPrices: { [TRITANIUM]: 5 },
    });
    const fibreRow = resolved[0].subBuild?.inputs.find((i) => i.typeID === FIBRE);

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

describe('shoppingListMaterials — leaves only, whatever the table shows', () => {
  it('leaves out a built material even when the table keeps a row for it', () => {
    const resolved = resolve([{ typeID: SEAL, quantity: 150 }], [SEAL], {
      materialPrices: { [FIBRE]: 20 },
    });

    expect(materialTableRows(resolved).map((r) => r.typeID)).toEqual([SEAL, FIBRE]);
    expect(shoppingListMaterials(resolved).map((m) => m.typeID)).toEqual([FIBRE]);
  });
});
