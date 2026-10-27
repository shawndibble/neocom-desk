import { describe, it, expect } from 'vitest';
import { bakeOreAndIceTypeIds } from './oreTypeIds.mjs';

const ASTEROID = 25;
const groups = new Map([
  [450, { name: 'Veldspar', categoryID: ASTEROID }],
  [465, { name: 'Ice', categoryID: ASTEROID }],
  [18, { name: 'Mineral', categoryID: 4 }],
]);

describe('bakeOreAndIceTypeIds', () => {
  it('includes ore with no market group, such as mission-only Banidine', () => {
    const types = new Map([
      [1230, { groupID: 450, published: true, marketGroupID: 1857 }],
      [28617, { groupID: 450, published: true, marketGroupID: null }],
    ]);
    expect(bakeOreAndIceTypeIds({ types, groups, marketOreTypeIds: [1230] })).toEqual([
      1230, 28617,
    ]);
  });

  it('keeps market-tree ore even when its group is not an Asteroid group', () => {
    const types = new Map([[9999, { groupID: 18, published: true, marketGroupID: 5 }]]);
    expect(bakeOreAndIceTypeIds({ types, groups, marketOreTypeIds: [9999] })).toEqual([9999]);
  });

  it('skips unpublished asteroid types and non-asteroid types', () => {
    const types = new Map([
      [1, { groupID: 450, published: false, marketGroupID: null }],
      [2, { groupID: 18, published: true, marketGroupID: null }],
    ]);
    expect(bakeOreAndIceTypeIds({ types, groups, marketOreTypeIds: [] })).toEqual([]);
  });
});
