import { describe, it, expect } from 'vitest';
import {
  buildCorpAssetTree,
  corpAssetGroupId,
  corpAssetLocationId,
  HANGAR_DIVISIONS,
  type CorpAssetInput,
} from './assetDivisions';

describe('corpAssetGroupId', () => {
  it('reads CorpSAG1..CorpSAG7 as division numbers 1..7', () => {
    expect(corpAssetGroupId('CorpSAG1')).toBe(1);
    expect(corpAssetGroupId('CorpSAG7')).toBe(7);
  });

  it('names the four corp-only flags a personal asset list never sees', () => {
    expect(corpAssetGroupId('OfficeFolder')).toBe('officeFolder');
    expect(corpAssetGroupId('CorpDeliveries')).toBe('corpDeliveries');
    expect(corpAssetGroupId('Impounded')).toBe('impounded');
    expect(corpAssetGroupId('AssetSafety')).toBe('assetSafety');
  });

  /**
   * CCP extends `location_flag` without notice (round 39's `Structure_manager`
   * lesson, applied here to a data value instead of a role string). An
   * unrecognised flag must land in a visible bucket, never disappear.
   */
  it('buckets an unrecognised flag as other rather than dropping it', () => {
    expect(corpAssetGroupId('SomeFutureFlag')).toBe('other');
    expect(corpAssetGroupId('CorpSAG8')).toBe('other');
    expect(corpAssetGroupId('CorpSAG0')).toBe('other');
  });
});

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

describe('buildCorpAssetTree', () => {
  it('always returns all seven hangar divisions, even when empty', () => {
    const groups = buildCorpAssetTree([]);
    expect(groups.map((g) => g.id)).toEqual([...HANGAR_DIVISIONS]);
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('sorts assets into the division their location_flag names', () => {
    const groups = buildCorpAssetTree([
      asset({ itemId: 1, locationFlag: 'CorpSAG3' }),
      asset({ itemId: 2, locationFlag: 'CorpSAG1' }),
    ]);
    expect(groups.find((g) => g.id === 1)?.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 2 }) },
    ]);
    expect(groups.find((g) => g.id === 3)?.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 1 }) },
    ]);
  });

  /**
   * The four special flags are not part of the seven-wide division axis
   * (CONTEXT.md round 44) — they only appear as sibling groups when the
   * corporation actually has something in them, and in a fixed order after
   * the seven divisions. `officeFolder` never appears at all: an office is a
   * pass-through, so a childless office row (as here) simply disappears
   * rather than surfacing as an empty-content group.
   */
  it('adds the special-flag groups only when they hold something, in a fixed order', () => {
    const empty = buildCorpAssetTree([asset({ itemId: 1, locationFlag: 'CorpSAG1' })]);
    expect(empty.map((g) => g.id)).toEqual([...HANGAR_DIVISIONS]);

    const withExtras = buildCorpAssetTree([
      asset({ itemId: 1, locationFlag: 'AssetSafety' }),
      asset({ itemId: 2, locationFlag: 'OfficeFolder' }),
      asset({ itemId: 3, locationFlag: 'CorpSAG1' }),
    ]);
    expect(withExtras.map((g) => g.id)).toEqual([...HANGAR_DIVISIONS, 'assetSafety']);
  });

  /**
   * The bug: an office's contents used to inherit the office's own
   * `OfficeFolder` flag instead of each child's real `CorpSAGn` division,
   * lumping everything under one undivided "Office" bucket with no station
   * name. An office is a pass-through — its own row disappears; each child
   * lands in its real division, wrapped in a location node named for the
   * station.
   */
  it('treats an office as a pass-through: dividing its contents and naming the station beneath each division', () => {
    const groups = buildCorpAssetTree([
      asset({
        itemId: 100,
        typeId: 27,
        locationFlag: 'OfficeFolder',
        locationType: 'other',
        locationId: 60003760,
      }),
      asset({ itemId: 1, locationFlag: 'CorpSAG1', locationType: 'item', locationId: 100 }),
      asset({ itemId: 2, locationFlag: 'CorpSAG3', locationType: 'item', locationId: 100 }),
    ]);

    expect(groups.map((g) => g.id)).toEqual([...HANGAR_DIVISIONS]);

    const division1 = groups.find((g) => g.id === 1);
    expect(division1?.children).toHaveLength(1);
    const locationNode = division1!.children[0];
    expect(corpAssetLocationId(locationNode)).toBe(60003760);
    expect(locationNode).toMatchObject({
      kind: 'container',
      itemCount: 1,
      children: [{ kind: 'item', asset: expect.objectContaining({ item_id: 1 }) }],
    });

    const division3 = groups.find((g) => g.id === 3);
    expect(corpAssetLocationId(division3!.children[0])).toBe(60003760);
  });

  it('buckets an unrecognised flag under other instead of dropping the asset', () => {
    const groups = buildCorpAssetTree([asset({ itemId: 9, locationFlag: 'SomeFutureFlag' })]);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 9 }) },
    ]);
  });

  it('nests a container placed in a division rather than flag-bucketing its contents separately', () => {
    const groups = buildCorpAssetTree([
      asset({ itemId: 10, typeId: 650, locationFlag: 'CorpSAG1' }),
      asset({
        itemId: 11,
        quantity: 3,
        locationId: 10,
        locationType: 'item',
        locationFlag: 'Unlocked',
      }),
    ]);
    const division1 = groups.find((g) => g.id === 1);
    expect(division1?.children).toEqual([
      expect.objectContaining({
        kind: 'container',
        children: [{ kind: 'item', asset: expect.objectContaining({ item_id: 11 }) }],
      }),
    ]);
  });

  it('prices leaf assets from the supplied price map', () => {
    const groups = buildCorpAssetTree(
      [asset({ itemId: 1, typeId: 100, quantity: 10 })],
      new Map([[100, 5]])
    );
    expect(groups.find((g) => g.id === 1)?.estimatedValue).toBe(50);
  });
});
