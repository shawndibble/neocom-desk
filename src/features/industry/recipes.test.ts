import { describe, it, expect, vi } from 'vitest';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import { piFixture } from '@/sde/__fixtures__/pi';
import type { CharacterBlueprint } from '@/esi/endpoints';

const BLUEPRINTS: BlueprintMap = {
  '9841': {
    name: 'Mechanical Parts Blueprint',
    time: 300,
    materials: [{ typeID: 34, quantity: 20 }],
    products: [{ typeID: 9840, quantity: 5 }],
    skills: [],
  },
  // A two-hop manufacturing chain (40 <- 41 <- 42), so `buildPlanTypeIds` has
  // something to exercise its second level of widening against: pricing a
  // make-or-buy verdict for 41 (an expanded row's own input) needs 42's hub
  // price too, one level beyond what a single `recipeInputTypeIds` pass reaches.
  '9843': {
    name: 'Isogen Blueprint',
    time: 100,
    materials: [{ typeID: 41, quantity: 3 }],
    products: [{ typeID: 40, quantity: 1 }],
    skills: [],
  },
  '9844': {
    name: 'Nocxium Blueprint',
    time: 50,
    materials: [{ typeID: 42, quantity: 2 }],
    products: [{ typeID: 41, quantity: 1 }],
    skills: [],
  },
};

const TYPES: TypeMap = {
  '9840': { name: 'Mechanical Parts', groupID: 334, volume: 1.5 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

const PI = piFixture({
  schematics: {
    '2398': {
      schematicId: 133,
      name: 'Reactive Metals',
      cycleTime: 1800,
      quantity: 20,
      volume: 0.19,
      facility: 'basic',
      planetTypes: ['barren', 'lava', 'plasma'],
      inputs: [{ typeID: 2267, quantity: 3000, name: 'Base Metals' }],
    },
  },
  raw: [
    {
      typeID: 2267,
      name: 'Base Metals',
      volume: 0.005,
      planetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
    },
  ],
});

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => TYPES),
}));

const { loadBlueprintCatalog } = await import('./blueprintCatalog');
const { buildPlanTypeIds, materialRecipe, recipeInputTypeIds } = await import('./recipes');

const catalog = await loadBlueprintCatalog();

function owned(overrides: Partial<CharacterBlueprint>): CharacterBlueprint {
  return {
    item_id: 1,
    material_efficiency: 0,
    quantity: 1,
    runs: -1,
    time_efficiency: 0,
    type_id: 9841,
    ...overrides,
  };
}

describe('materialRecipe', () => {
  it('returns the manufacturing recipe for a material some blueprint produces', () => {
    expect(materialRecipe(9840, { catalog, pi: PI, ownedBlueprints: [] })).toEqual({
      method: 'manufacturing',
      blueprint: {
        name: 'Mechanical Parts Blueprint',
        time: 300,
        materials: [{ typeID: 34, quantity: 20 }],
        products: [{ typeID: 9840, quantity: 5 }],
      },
      me: 0,
    });
  });

  it('quotes the sub-job at the ME of the copy the character owns', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [owned({ material_efficiency: 8 })],
    });
    expect(recipe).toMatchObject({ me: 8 });
  });

  it('clamps a nonsense owned ME into the range the engine accepts', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [owned({ material_efficiency: 99 })],
    });
    expect(recipe).toMatchObject({ me: 10 });
  });

  it('returns the schematic for a planetary commodity', () => {
    expect(materialRecipe(2398, { catalog, pi: PI, ownedBlueprints: [] })).toEqual({
      method: 'planetary',
      outputQuantity: 20,
      inputs: [{ typeID: 2267, quantity: 3000 }],
    });
  });

  it('has no recipe for a raw planetary resource — an extractor pulls it, no schematic makes it', () => {
    expect(materialRecipe(2267, { catalog, pi: PI, ownedBlueprints: [] })).toBeNull();
  });

  it('has no recipe for a mineral', () => {
    expect(materialRecipe(34, { catalog, pi: PI, ownedBlueprints: [] })).toBeNull();
  });

  it('falls back to blueprints alone when pi.json is unavailable', () => {
    const sources = { catalog, pi: null, ownedBlueprints: [] };
    expect(materialRecipe(2398, sources)).toBeNull();
    expect(materialRecipe(9840, sources)).toMatchObject({ method: 'manufacturing' });
  });
});

describe('recipeInputTypeIds', () => {
  it('collects one level of recipe inputs, deduplicated', () => {
    const ids = recipeInputTypeIds([9840, 2398, 34], { catalog, pi: PI });
    expect(ids.sort((a, b) => a - b)).toEqual([34, 2267]);
  });

  it('is empty when nothing in the list is produced by anything', () => {
    expect(recipeInputTypeIds([34], { catalog, pi: PI })).toEqual([]);
  });
});

describe('buildPlanTypeIds', () => {
  // A plain blueprint, not from the fixture catalog: one material (2398) is a
  // planetary schematic's output, the other (40) is manufactured and itself
  // has an input (41) with its own producer, and the product (9840) is
  // manufactured by fixture blueprint 9841 — so the two-level widening below
  // exercises the manufacturing and planetary recipe paths, and a second
  // manufacturing hop, all at once, same as `BuildPlanDetail.tsx`'s price
  // fetch (shared via this function, issue #453 — the Compare table widens
  // its own fetch identically).
  const blueprint = {
    name: 'Widening test blueprint',
    time: 60,
    materials: [
      { typeID: 2398, quantity: 1 },
      { typeID: 40, quantity: 1 },
    ],
    products: [{ typeID: 9840, quantity: 1 }],
  };

  it('adds the product to materials, then two levels of recipe inputs for each', () => {
    const ids = buildPlanTypeIds(blueprint, { catalog, pi: PI });
    // 2398 (material) -> planetary input 2267.
    // 40 (material) -> manufacturing input 41 -> its own input 42.
    // 9840 (product) -> manufacturing input 34.
    // The second level (41 -> 42) is what a make-or-buy verdict on an
    // expanded row's own input (41) needs a price for — one level a plain
    // `recipeInputTypeIds` pass never reaches.
    expect(ids.sort((a, b) => a - b)).toEqual([34, 40, 41, 42, 2267, 2398, 9840]);
  });

  it('skips the planetary widening when pi.json is unavailable', () => {
    const ids = buildPlanTypeIds(blueprint, { catalog, pi: null });
    // No pi means no schematic for 2398, so 2267 never gets added — 2398
    // itself stays, as a plain material with nothing produced beneath it.
    // The manufacturing side (40 -> 41 -> 42, 9840 -> 34) is unaffected.
    expect(ids.sort((a, b) => a - b)).toEqual([34, 40, 41, 42, 2398, 9840]);
  });
});
