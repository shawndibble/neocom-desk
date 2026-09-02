import { describe, expect, it } from 'vitest';
import { buildVariationIndex, getVariations, type VariationTypeMap } from './variations';

const META_GROUP_NAMES = {
  1: 'Tech I',
  2: 'Tech II',
  4: 'Faction',
};

// 178 = Tech I root, 179 = Tech II variant, 196 = Faction variant, of one family.
// 200 = an unrelated Tech I root with no variants at all.
const TYPES: VariationTypeMap = {
  178: { parentTypeId: null, metaGroupId: 1 },
  179: { parentTypeId: 178, metaGroupId: 2 },
  196: { parentTypeId: 178, metaGroupId: 4 },
  200: { parentTypeId: null, metaGroupId: 1 },
};

describe('getVariations', () => {
  it('returns the root plus every sibling when queried by the root typeId', () => {
    const index = buildVariationIndex(TYPES, META_GROUP_NAMES);
    expect(getVariations(index, 178)).toEqual({
      rootTypeId: 178,
      members: [
        { typeId: 178, metaGroupId: 1, metaGroupName: 'Tech I' },
        { typeId: 179, metaGroupId: 2, metaGroupName: 'Tech II' },
        { typeId: 196, metaGroupId: 4, metaGroupName: 'Faction' },
      ],
    });
  });

  it('resolves to the same group when queried by a variant typeId', () => {
    const index = buildVariationIndex(TYPES, META_GROUP_NAMES);
    expect(getVariations(index, 196)).toEqual(getVariations(index, 178));
  });

  it('returns an empty member list for a typeId with no meta classification', () => {
    const index = buildVariationIndex(TYPES, META_GROUP_NAMES);
    expect(getVariations(index, 999999)).toEqual({ rootTypeId: 999999, members: [] });
  });

  it('skips a member whose metaGroupId has no display name rather than fabricating one', () => {
    const index = buildVariationIndex(TYPES, { 1: 'Tech I' });
    expect(getVariations(index, 178)).toEqual({
      rootTypeId: 178,
      members: [{ typeId: 178, metaGroupId: 1, metaGroupName: 'Tech I' }],
    });
  });

  it('orders members by metaGroupId then typeId, independent of input order', () => {
    const shuffled: VariationTypeMap = {
      196: { parentTypeId: 178, metaGroupId: 4 },
      178: { parentTypeId: null, metaGroupId: 1 },
      179: { parentTypeId: 178, metaGroupId: 2 },
    };
    const index = buildVariationIndex(shuffled, META_GROUP_NAMES);
    expect(getVariations(index, 178).members.map((m) => m.typeId)).toEqual([178, 179, 196]);
  });

  it('returns a group of just the root when it has no variants', () => {
    const index = buildVariationIndex(TYPES, META_GROUP_NAMES);
    expect(getVariations(index, 200)).toEqual({
      rootTypeId: 200,
      members: [{ typeId: 200, metaGroupId: 1, metaGroupName: 'Tech I' }],
    });
  });
});
