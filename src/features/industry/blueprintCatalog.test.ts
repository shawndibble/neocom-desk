import { describe, it, expect, vi } from 'vitest';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import type { BuildPlanRecord } from '@/db';

const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 4500 }],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '640': {
    name: 'No Product Blueprint',
    time: 600,
    materials: [{ typeID: 34, quantity: 100 }],
    products: [],
    skills: [],
    activity: 'manufacturing',
  },
  // A reaction formula (issue #460): must surface through the same catalog
  // as a manufacturing blueprint, not a separate lookup, for the picker to
  // find it by product name and the facility filter to key off its activity.
  '46157': {
    name: 'Methanofullerene Reaction Formula',
    time: 10800,
    materials: [{ typeID: 16272, quantity: 3200 }],
    products: [{ typeID: 16667, quantity: 100 }],
    skills: [],
    activity: 'reaction',
  },
};

const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '16667': { name: 'Reinforced Carbon Fiber', groupID: 428, volume: 5 },
};

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => TYPES),
}));

const {
  loadBlueprintCatalog,
  searchByProductName,
  toIndustryBlueprint,
  nameForType,
  buildPlansByMaterialTypeID,
} = await import('./blueprintCatalog');

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'p1',
    characterId: 1,
    name: 'Rifter run',
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

describe('loadBlueprintCatalog', () => {
  it('keys entries by blueprint typeID and resolves the product name via types.json', async () => {
    const catalog = await loadBlueprintCatalog();
    const entry = catalog.byBlueprintTypeID.get(638);
    expect(entry).toEqual({
      blueprintTypeID: 638,
      blueprint: BLUEPRINTS['638'],
      productTypeID: 587,
      productName: 'Rifter',
      productNameLower: 'rifter',
    });
  });

  it('falls back to the blueprint name when there is no product', async () => {
    const catalog = await loadBlueprintCatalog();
    const entry = catalog.byBlueprintTypeID.get(640);
    expect(entry?.productTypeID).toBeNull();
    expect(entry?.productName).toBe('No Product Blueprint');
  });

  it("also keys entries by product typeID, for looking up an item's blueprint", async () => {
    const catalog = await loadBlueprintCatalog();
    expect(catalog.byProductTypeID.get(587)?.blueprintTypeID).toBe(638);
  });

  it('has no product-typeID entry for an item no blueprint produces', async () => {
    const catalog = await loadBlueprintCatalog();
    expect(catalog.byProductTypeID.has(34)).toBe(false);
  });

  it('surfaces a reaction formula the same way as a manufacturing blueprint (issue #460)', async () => {
    const catalog = await loadBlueprintCatalog();
    const entry = catalog.byBlueprintTypeID.get(46157);
    expect(entry).toMatchObject({
      productTypeID: 16667,
      productName: 'Reinforced Carbon Fiber',
    });
    expect(entry?.blueprint.activity).toBe('reaction');
    expect(catalog.byProductTypeID.get(16667)?.blueprintTypeID).toBe(46157);
  });
});

describe('searchByProductName', () => {
  it('finds a blueprint by its product name, case-insensitively', async () => {
    const catalog = await loadBlueprintCatalog();
    const results = searchByProductName(catalog, 'rift');
    expect(results.map((r) => r.blueprintTypeID)).toEqual([638]);
  });

  it('returns nothing for a blank query', async () => {
    const catalog = await loadBlueprintCatalog();
    expect(searchByProductName(catalog, '   ')).toEqual([]);
  });

  it("finds a reaction formula by its product's name too (issue #460)", async () => {
    const catalog = await loadBlueprintCatalog();
    const results = searchByProductName(catalog, 'reinforced carbon');
    expect(results.map((r) => r.blueprintTypeID)).toEqual([46157]);
  });

  it('precomputes productNameLower once rather than lower-casing on every search call', async () => {
    const catalog = await loadBlueprintCatalog();
    const entry = catalog.byBlueprintTypeID.get(638);
    expect(entry?.productNameLower).toBe('rifter');
  });
});

describe('toIndustryBlueprint', () => {
  it('adapts an SDE blueprint to the engine shape, dropping skills', () => {
    expect(toIndustryBlueprint(BLUEPRINTS['638'])).toEqual({
      name: 'Rifter Blueprint',
      time: 1200,
      materials: [{ typeID: 34, quantity: 4500 }],
      products: [{ typeID: 587, quantity: 1 }],
      activity: 'manufacturing',
    });
  });
});

describe('buildPlansByMaterialTypeID', () => {
  it("maps a material typeID to the character's own plan whose blueprint consumes it", async () => {
    const catalog = await loadBlueprintCatalog();
    const p = plan();
    const map = buildPlansByMaterialTypeID([p], catalog);
    expect(map.get(34)).toBe(p);
  });

  it('has no entry for a material no owned plan consumes', async () => {
    const catalog = await loadBlueprintCatalog();
    expect(buildPlansByMaterialTypeID([], catalog).has(34)).toBe(false);
  });

  it('has no entry for a plan whose blueprintTypeID matches no catalog entry', async () => {
    const catalog = await loadBlueprintCatalog();
    const map = buildPlansByMaterialTypeID([plan({ blueprintTypeID: 12345 })], catalog);
    expect(map.size).toBe(0);
  });

  it('first plan wins when multiple owned plans consume the same material', async () => {
    const catalog = await loadBlueprintCatalog();
    const first = plan({ id: 'first' });
    const second = plan({ id: 'second' });
    const map = buildPlansByMaterialTypeID([first, second], catalog);
    expect(map.get(34)).toBe(first);
  });
});

describe('nameForType', () => {
  it('resolves a known typeID via types.json', async () => {
    const catalog = await loadBlueprintCatalog();
    expect(nameForType(catalog, 34)).toBe('Tritanium');
  });

  it('falls back to #typeID when unknown', async () => {
    const catalog = await loadBlueprintCatalog();
    expect(nameForType(catalog, 99999)).toBe('#99999');
  });
});
