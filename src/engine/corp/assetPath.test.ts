import { describe, it, expect } from 'vitest';
import { corpAssetPathHref, parseCorpAssetPath, resolveCorpAssetPath } from './assetPath';
import { buildCorpAssetTree, type CorpAssetGroupId, type CorpAssetInput } from './assetDivisions';

const asset = (
  overrides: Partial<CorpAssetInput> & Pick<CorpAssetInput, 'itemId'>
): CorpAssetInput => ({
  typeId: 100,
  quantity: 1,
  locationId: 60003760,
  locationType: 'other',
  locationFlag: 'CorpSAG1',
  ...overrides,
});

describe('resolveCorpAssetPath', () => {
  it('resolves the root when groupId is null', () => {
    const groups = buildCorpAssetTree([]);
    expect(resolveCorpAssetPath(groups, null, [])).toEqual({
      group: null,
      trail: [],
      children: [],
      unresolved: [],
    });
  });

  it('reports an unknown group id whole, rather than silently redirecting', () => {
    const groups = buildCorpAssetTree([]);
    const resolved = resolveCorpAssetPath(groups, 'officeFolder', ['extra']);
    expect(resolved.group).toBeNull();
    expect(resolved.unresolved).toEqual(['officeFolder', 'extra']);
  });

  it('reports an out-of-range division number unresolved rather than silently rooting', () => {
    // A number outside 1-7 has no real HangarDivisionNumber type, but
    // resolveCorpAssetPath must still handle one arriving from a parsed URL —
    // see parseCorpAssetPath's matching test for why the parser lets it through.
    const groups = buildCorpAssetTree([]);
    const resolved = resolveCorpAssetPath(groups, 8 as unknown as CorpAssetGroupId, []);
    expect(resolved.group).toBeNull();
    expect(resolved.unresolved).toEqual(['8']);
  });

  it('resolves a known, empty division to its (empty) children', () => {
    const groups = buildCorpAssetTree([]);
    const resolved = resolveCorpAssetPath(groups, 1, []);
    expect(resolved.group?.id).toBe(1);
    expect(resolved.children).toEqual([]);
    expect(resolved.unresolved).toEqual([]);
  });

  it('drills into a container placed in a division via its item-id segment', () => {
    const groups = buildCorpAssetTree([
      asset({ itemId: 10, typeId: 650, locationFlag: 'CorpSAG1' }),
      asset({
        itemId: 11,
        locationId: 10,
        locationType: 'item',
        locationFlag: 'Unlocked',
      }),
    ]);
    const resolved = resolveCorpAssetPath(groups, 1, ['i:10']);
    expect(resolved.trail).toHaveLength(1);
    expect(resolved.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 11 }) },
    ]);
  });

  it('reports a stale segment as unresolved rather than crashing', () => {
    const groups = buildCorpAssetTree([asset({ itemId: 1 })]);
    const resolved = resolveCorpAssetPath(groups, 1, ['i:999']);
    expect(resolved.group?.id).toBe(1);
    expect(resolved.unresolved).toEqual(['i:999']);
  });
});

describe('parseCorpAssetPath', () => {
  it('parses an empty wildcard as the root', () => {
    expect(parseCorpAssetPath('')).toEqual({ groupId: null, segments: [] });
  });

  it('parses a hangar division number', () => {
    expect(parseCorpAssetPath('3')).toEqual({ groupId: 3, segments: [] });
  });

  it('parses a named flag group, with trailing segments', () => {
    expect(parseCorpAssetPath('officeFolder/i:10/i:11')).toEqual({
      groupId: 'officeFolder',
      segments: ['i:10', 'i:11'],
    });
  });

  it('falls back to root for a non-numeric head that names no known flag group', () => {
    expect(parseCorpAssetPath('nonsense')).toEqual({ groupId: null, segments: [] });
  });

  /**
   * An out-of-range division number still parses as a candidate id — it is
   * `resolveCorpAssetPath`, not the parser, that reports it unresolved (no
   * real group has that id), the same split `/assets` makes for an unknown
   * numeric station id. Silently rooting here instead would also contradict
   * `ALL_CORP_ASSET_GROUP_IDS`'s own promise that an 8th division is a
   * one-place addition.
   */
  it('parses an out-of-range division number as a candidate id rather than rooting silently', () => {
    expect(parseCorpAssetPath('8')).toEqual({ groupId: 8, segments: [] });
  });
});

describe('corpAssetPathHref', () => {
  it('builds the root href for a null group', () => {
    expect(corpAssetPathHref(null, [])).toBe('/corp/assets');
  });

  it('builds a division href', () => {
    expect(corpAssetPathHref(1, [])).toBe('/corp/assets/1');
  });

  it('builds a href with trailing segments', () => {
    expect(corpAssetPathHref('officeFolder', ['i:10'])).toBe('/corp/assets/officeFolder/i:10');
  });
});
