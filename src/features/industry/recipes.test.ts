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
const { materialRecipe, recipeInputTypeIds } = await import('./recipes');

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
