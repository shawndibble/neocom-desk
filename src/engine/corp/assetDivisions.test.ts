import { describe, it, expect } from 'vitest';
import { corpAssetGroupId } from './assetDivisions';

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
