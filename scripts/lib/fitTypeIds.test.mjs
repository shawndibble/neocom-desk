import { describe, expect, it } from 'vitest';
import { fitTypeIds } from './fitTypeIds.mjs';

const groups = new Map([
  [303, { name: 'Booster', categoryID: 20 }],
  [25, { name: 'Frigate', categoryID: 6 }],
  [100, { name: 'Combat Drone', categoryID: 18 }],
  [4041, { name: 'Jump Filaments', categoryID: 17 }],
  [1979, { name: 'Abyssal Filaments', categoryID: 17 }],
  [18, { name: 'Mineral', categoryID: 4 }],
  [280, { name: 'General Freight', categoryID: 17 }],
  [1950, { name: 'Permanent SKIN', categoryID: 91 }],
]);

const type = (groupID, published = true) => ({ groupID, published });

describe('fitTypeIds', () => {
  it('takes every published type in a category a Fitting can hold', () => {
    const types = new Map([
      [46002, type(303)],
      [601, type(25)],
      [92033, type(100)],
    ]);
    expect([...fitTypeIds(types, groups)].sort((a, b) => a - b)).toEqual([601, 46002, 92033]);
  });

  it('takes filaments, which are commodities, by their group name', () => {
    const types = new Map([
      [47889, type(4041)],
      [47762, type(1979)],
      [3, type(280)],
    ]);
    expect([...fitTypeIds(types, groups)].sort((a, b) => a - b)).toEqual([47762, 47889]);
  });

  it('skips unpublished types, other categories, and types with no known group', () => {
    const types = new Map([
      [1, type(303, false)],
      [34, type(18)],
      [2, type(1950)],
      [5, type(99999)],
    ]);
    expect([...fitTypeIds(types, groups)]).toEqual([]);
  });
});
