import { describe, expect, it } from 'vitest';
import { buildLibraryRows, filterLibraryRows, type MemberLibrary } from './libraryMatrix';

const catalog = [
  { typeId: 1, name: 'Alpha BP', marketGroupId: 10 },
  { typeId: 2, name: 'Beta BP', marketGroupId: 10 },
  { typeId: 3, name: 'Gamma BP', marketGroupId: null },
];

const bp = (typeId: number, runs = -1) => ({
  typeId,
  me: 0,
  te: 0,
  runs,
  locationName: 'Jita IV',
  systemName: 'Jita',
});

const libraries: MemberLibrary[] = [
  { uid: 'me', items: [bp(1)] },
  { uid: 'ann', items: [bp(1, 5), bp(1, 10), bp(2, 3)] },
  { uid: 'bob', items: [] },
];

describe('buildLibraryRows', () => {
  it('lists every catalog blueprint with its holders, one entry per Member', () => {
    const rows = buildLibraryRows(catalog, libraries);
    expect(rows.map((r) => r.typeId)).toEqual([1, 2, 3]);
    expect(rows[0].holders).toEqual([
      { uid: 'me', copies: 1, hasOriginal: true },
      { uid: 'ann', copies: 2, hasOriginal: false },
    ]);
    expect(rows[1].holders).toEqual([{ uid: 'ann', copies: 1, hasOriginal: false }]);
    expect(rows[2].holders).toEqual([]);
  });

  it('ignores shared types outside the catalog', () => {
    const rows = buildLibraryRows(catalog, [{ uid: 'ann', items: [bp(99)] }]);
    expect(rows.every((r) => r.holders.length === 0)).toBe(true);
  });
});

describe('filterLibraryRows', () => {
  const rows = buildLibraryRows(catalog, libraries);
  const ids = (list: { typeId: number }[]) => list.map((r) => r.typeId);

  it('missing from the Community: nobody holds it', () => {
    expect(ids(filterLibraryRows(rows, 'me', 'missingCommunity', ''))).toEqual([3]);
  });

  it('owned by me', () => {
    expect(ids(filterLibraryRows(rows, 'me', 'ownedByMe', ''))).toEqual([1]);
  });

  it('missing from me: someone else holds it, I do not', () => {
    expect(ids(filterLibraryRows(rows, 'me', 'missingFromMe', ''))).toEqual([2]);
  });

  it('searches by name, any case', () => {
    expect(ids(filterLibraryRows(rows, 'me', 'missingFromMe', 'beta'))).toEqual([2]);
  });
});
