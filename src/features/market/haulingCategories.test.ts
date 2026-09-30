import { describe, expect, it } from 'vitest';
import { isHaulingCategoryId, typeIdsInCategory } from './haulingCategories';

const groups = [
  { id: 11, name: 'Ammunition & Charges', parentId: null, hasTypes: false },
  { id: 100, name: 'Projectile', parentId: 11, hasTypes: false },
  { id: 101, name: 'Faction', parentId: 100, hasTypes: true },
  { id: 9, name: 'Ship Equipment', parentId: null, hasTypes: false },
  { id: 200, name: 'Turrets', parentId: 9, hasTypes: true },
];
const types = [
  { typeId: 30, name: 'C', marketGroupId: 101, volume: 1 },
  { typeId: 10, name: 'A', marketGroupId: 100, volume: 1 },
  { typeId: 20, name: 'B', marketGroupId: 200, volume: 1 },
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

describe('isHaulingCategoryId', () => {
  it('accepts the offered categories and nothing else', () => {
    expect(isHaulingCategoryId(11)).toBe(true);
    expect(isHaulingCategoryId(4)).toBe(false); // Ships
  });
});
