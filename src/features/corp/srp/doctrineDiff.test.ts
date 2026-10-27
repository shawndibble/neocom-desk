import { describe, expect, it } from 'vitest';
import { diffSections, diffTypeIds, groupTypeIds } from './doctrineDiff';

describe('doctrineDiff', () => {
  it('groups repeated type ids into counted lines', () => {
    expect(groupTypeIds([5, 5, 7, 5])).toEqual([
      { typeId: 5, count: 3 },
      { typeId: 7, count: 1 },
    ]);
    expect(groupTypeIds([])).toEqual([]);
  });

  it('lists only the non-empty parts of a diff, in reading order', () => {
    const sections = diffSections({
      missingModules: [1, 1],
      extraModules: [],
      missingRigs: [],
      extraRigs: [9],
    });
    expect(sections).toEqual([
      { key: 'missingModules', lines: [{ typeId: 1, count: 2 }] },
      { key: 'extraRigs', lines: [{ typeId: 9, count: 1 }] },
    ]);
  });

  it('an empty diff has no sections', () => {
    expect(
      diffSections({ missingModules: [], extraModules: [], missingRigs: [], extraRigs: [] })
    ).toEqual([]);
  });

  it('collects every type id a diff names, once', () => {
    expect(
      diffTypeIds({ missingModules: [1, 1], extraModules: [2], missingRigs: [1], extraRigs: [] })
    ).toEqual([1, 2]);
  });
});
