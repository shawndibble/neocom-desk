import { describe, expect, it } from 'vitest';
import {
  EVERYTHING_CATEGORY_ID,
  isHaulingCategoryId,
  typeIdsInCategory,
  typeIdsInHaulingCategory,
  typeIdsOutsideHaulingCategory,
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

describe('typeIdsOutsideHaulingCategory', () => {
  it('covers every other offered category, sorted, still without ships', () => {
    expect(typeIdsOutsideHaulingCategory(9, groups, types)).toEqual([10, 30]);
    expect(typeIdsOutsideHaulingCategory(11, groups, types)).toEqual([20]);
  });
  it('is empty for Everything, which already covers them all', () => {
    expect(typeIdsOutsideHaulingCategory(EVERYTHING_CATEGORY_ID, groups, types)).toEqual([]);
  });
  it('never hands back a type of the category itself, even one nested under another root', () => {
    // 955 sits under 9 here: a type under 955 is in both, and must stay out of 955's fill.
    const nested = [...groups, { id: 955, name: 'Modifications', parentId: 9, hasTypes: true }];
    const nestedTypes = [...types, { typeId: 50, name: 'E', marketGroupId: 955, volume: 1 }];
    expect(typeIdsOutsideHaulingCategory(955, nested, nestedTypes)).toEqual([10, 20, 30]);
  });
});

describe('isHaulingCategoryId', () => {
  it('accepts the offered categories and Everything, and nothing else', () => {
    expect(isHaulingCategoryId(11)).toBe(true);
    expect(isHaulingCategoryId(EVERYTHING_CATEGORY_ID)).toBe(true);
    expect(isHaulingCategoryId(4)).toBe(false); // Ships
  });
});
