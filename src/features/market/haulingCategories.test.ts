import { describe, expect, it } from 'vitest';
import {
  EVERYTHING_CATEGORY_ID,
  haulingCategoryOf,
  isHaulingCategoryId,
  typeIdsInCategory,
  typeIdsInHaulingCategory,
} from './haulingCategories';

const groups = [
  { id: 11, name: 'Ammunition & Charges', parentId: null, hasTypes: false },
  { id: 100, name: 'Projectile', parentId: 11, hasTypes: false },
  { id: 101, name: 'Faction', parentId: 100, hasTypes: true },
  { id: 9, name: 'Ship Equipment', parentId: null, hasTypes: false },
  { id: 200, name: 'Turrets', parentId: 9, hasTypes: true },
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 400, name: 'Frigates', parentId: 4, hasTypes: true },
];
const types = [
  { typeId: 30, name: 'C', marketGroupId: 101, volume: 1 },
  { typeId: 10, name: 'A', marketGroupId: 100, volume: 1 },
  { typeId: 20, name: 'B', marketGroupId: 200, volume: 1 },
  { typeId: 40, name: 'D', marketGroupId: 400, volume: 1 },
];

describe('typeIdsInCategory', () => {
  it('collects types at every depth under the root, sorted', () => {
    expect(typeIdsInCategory(11, groups, types)).toEqual([10, 30]);
  });
  it('does not leak into a sibling category', () => {
    expect(typeIdsInCategory(9, groups, types)).toEqual([20]);
  });
  it('is empty for an unknown root', () => {
    expect(typeIdsInCategory(999, groups, types)).toEqual([]);
  });
});

describe('typeIdsInHaulingCategory', () => {
  it('scans one offered category on its own', () => {
    expect(typeIdsInHaulingCategory(9, groups, types)).toEqual([20]);
  });
  it('scans every offered category for Everything, sorted, still without ships', () => {
    expect(typeIdsInHaulingCategory(EVERYTHING_CATEGORY_ID, groups, types)).toEqual([10, 20, 30]);
  });
});

describe('isHaulingCategoryId', () => {
  it('accepts the offered categories and Everything, and nothing else', () => {
    expect(isHaulingCategoryId(11)).toBe(true);
    expect(isHaulingCategoryId(EVERYTHING_CATEGORY_ID)).toBe(true);
    expect(isHaulingCategoryId(4)).toBe(false); // Ships
  });

  it('offers the bulk-goods categories: Manufacture & Research, Structures and their modifications and equipment', () => {
    for (const id of [475, 477, 2203, 2202]) expect(isHaulingCategoryId(id)).toBe(true);
  });

  it('keeps out the groups with nothing to haul by volume', () => {
    // Blueprints & Reactions, Skills, Ship SKINs, Apparel, Personalization, Special Edition Assets, Pilot's Services.
    for (const id of [2, 150, 1954, 1396, 3628, 1659, 1922])
      expect(isHaulingCategoryId(id)).toBe(false);
  });
});

describe('haulingCategoryOf', () => {
  it('maps each asked type to the Hauling category it sits under, at any depth', () => {
    const byType = haulingCategoryOf([10, 30, 20], groups, types);
    expect(byType.get(10)).toBe(11);
    expect(byType.get(30)).toBe(11);
    expect(byType.get(20)).toBe(9);
  });
  it('leaves out types outside every offered category, and types not asked for', () => {
    const byType = haulingCategoryOf([40, 10], groups, types);
    expect(byType.has(40)).toBe(false);
    expect(byType.has(30)).toBe(false);
  });
});
