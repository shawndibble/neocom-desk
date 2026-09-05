import { describe, it, expect } from 'vitest';
import {
  NO_EXPANDED_DIVISIONS,
  expandedCorpAssetGroups,
  parseCorpAssetsExpanded,
  withToggledCorpAssetGroup,
} from './assetsExpandPreference';

const CORP_A = 98000001;
const CORP_B = 98000002;

describe('withToggledCorpAssetGroup / expandedCorpAssetGroups', () => {
  it('has nothing expanded to start with', () => {
    expect(expandedCorpAssetGroups(NO_EXPANDED_DIVISIONS, CORP_A)).toEqual(new Set());
  });

  it('expands a division the first time it is toggled', () => {
    const next = withToggledCorpAssetGroup(NO_EXPANDED_DIVISIONS, CORP_A, 3);
    expect(expandedCorpAssetGroups(next, CORP_A)).toEqual(new Set([3]));
  });

  it('collapses it again the second time', () => {
    const opened = withToggledCorpAssetGroup(NO_EXPANDED_DIVISIONS, CORP_A, 3);
    const closed = withToggledCorpAssetGroup(opened, CORP_A, 3);
    expect(expandedCorpAssetGroups(closed, CORP_A)).toEqual(new Set());
  });

  it('tracks flag groups and numbered divisions independently', () => {
    const next = withToggledCorpAssetGroup(NO_EXPANDED_DIVISIONS, CORP_A, 'assetSafety');
    expect(expandedCorpAssetGroups(next, CORP_A)).toEqual(new Set(['assetSafety']));
  });

  /** The whole reason this is keyed by corporation (issue #420): a director of two corporations must not have one's open divisions leak into the other. */
  it('never lets one corporation’s expanded state leak into another', () => {
    const next = withToggledCorpAssetGroup(NO_EXPANDED_DIVISIONS, CORP_A, 1);
    expect(expandedCorpAssetGroups(next, CORP_B)).toEqual(new Set());
  });

  it('returns nothing expanded when there is no active corporation yet', () => {
    const next = withToggledCorpAssetGroup(NO_EXPANDED_DIVISIONS, CORP_A, 1);
    expect(expandedCorpAssetGroups(next, null)).toEqual(new Set());
  });
});

describe('parseCorpAssetsExpanded', () => {
  it('accepts a well-formed stored value', () => {
    const stored = { byCorporation: { [CORP_A]: [1, 'assetSafety'] } };
    expect(parseCorpAssetsExpanded(stored)).toEqual({
      byCorporation: { [CORP_A]: [1, 'assetSafety'] },
    });
  });

  it('rejects a non-object value', () => {
    expect(parseCorpAssetsExpanded('nope')).toBeNull();
    expect(parseCorpAssetsExpanded(null)).toBeNull();
    expect(parseCorpAssetsExpanded([1, 2])).toBeNull();
  });

  it('rejects a corporation entry that is not an array', () => {
    expect(parseCorpAssetsExpanded({ byCorporation: { [CORP_A]: 'not-an-array' } })).toBeNull();
  });

  it('rejects a group id that is neither a division number nor a known flag', () => {
    expect(parseCorpAssetsExpanded({ byCorporation: { [CORP_A]: ['notAGroup'] } })).toBeNull();
    expect(parseCorpAssetsExpanded({ byCorporation: { [CORP_A]: [8] } })).toBeNull();
  });
});
