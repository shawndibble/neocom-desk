import { describe, it, expect } from 'vitest';
import { corpAssetGroupId, groupCorpAssets, HANGAR_DIVISIONS } from './assetDivisions';

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

const asset = (overrides: Partial<Parameters<typeof groupCorpAssets>[0][number]>) => ({
  itemId: 1,
  typeId: 100,
  quantity: 1,
  locationId: 60003760,
  locationFlag: 'CorpSAG1',
  ...overrides,
});

describe('groupCorpAssets', () => {
  it('always returns all seven hangar divisions, even when empty', () => {
    const groups = groupCorpAssets([]);
    const divisionIds = groups.map((g) => g.id);
    expect(divisionIds).toEqual([...HANGAR_DIVISIONS]);
    expect(groups.every((g) => g.rows.length === 0)).toBe(true);
  });

  it('sorts rows into the division their location_flag names', () => {
    const groups = groupCorpAssets([
      asset({ itemId: 1, locationFlag: 'CorpSAG3' }),
      asset({ itemId: 2, locationFlag: 'CorpSAG1' }),
    ]);
    expect(groups.find((g) => g.id === 1)?.rows.map((r) => r.itemId)).toEqual([2]);
    expect(groups.find((g) => g.id === 3)?.rows.map((r) => r.itemId)).toEqual([1]);
  });

  /**
   * The four special flags are not part of the seven-wide division axis
   * (CONTEXT.md round 44) — they only appear as sibling groups when the
   * corporation actually has something in them, and in a fixed order after
   * the seven divisions.
   */
  it('adds the special-flag groups only when they hold something, in a fixed order', () => {
    const empty = groupCorpAssets([asset({ locationFlag: 'CorpSAG1' })]);
    expect(empty.map((g) => g.id)).toEqual([...HANGAR_DIVISIONS]);

    const withExtras = groupCorpAssets([
      asset({ itemId: 1, locationFlag: 'AssetSafety' }),
      asset({ itemId: 2, locationFlag: 'OfficeFolder' }),
      asset({ itemId: 3, locationFlag: 'CorpSAG1' }),
    ]);
    expect(withExtras.map((g) => g.id)).toEqual([
      ...HANGAR_DIVISIONS,
      'officeFolder',
      'assetSafety',
    ]);
  });

  it('buckets an unrecognised flag under other instead of dropping the row', () => {
    const groups = groupCorpAssets([asset({ itemId: 9, locationFlag: 'SomeFutureFlag' })]);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.rows.map((r) => r.itemId)).toEqual([9]);
  });

  it('drops locationFlag from the row shape once it has decided the bucket', () => {
    const groups = groupCorpAssets([asset({ itemId: 5, quantity: 3, locationId: 60003760 })]);
    const row = groups.find((g) => g.id === 1)?.rows[0];
    expect(row).toEqual({ itemId: 5, typeId: 100, quantity: 3, locationId: 60003760 });
  });
});
