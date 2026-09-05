import { describe, it, expect, vi } from 'vitest';
import type { BlueprintMap, TypeMap } from '@/sde/types';

const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [{ typeID: 34, quantity: 4500 }],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
  },
  '640': {
    name: 'No Product Blueprint',
    time: 600,
    materials: [{ typeID: 34, quantity: 100 }],
    products: [],
    skills: [],
  },
};

const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27289 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => TYPES),
}));

const { loadBlueprintCatalog, searchByProductName, toIndustryBlueprint, nameForType } =
  await import('./blueprintCatalog');

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
    });
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
