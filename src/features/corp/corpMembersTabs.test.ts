import { describe, expect, it } from 'vitest';
import { legacyCorpMembersLocation } from './corpMembersTabs';

describe('legacyCorpMembersLocation', () => {
  it('moves an old ?tab=roles link to the Roles path, keeping its other params', () => {
    expect(legacyCorpMembersLocation('/corp/members', '?tab=roles&dark=1')).toEqual({
      pathname: '/corp/members/roles',
      search: '?dark=1',
    });
    expect(legacyCorpMembersLocation('/corp/members/', '?tab=members')).toEqual({
      pathname: '/corp/members/roster',
      search: '',
    });
  });

  it('moves the old /members tab path to /roster', () => {
    expect(legacyCorpMembersLocation('/corp/members/members', '?dark=1')).toEqual({
      pathname: '/corp/members/roster',
      search: '?dark=1',
    });
  });

  it('leaves every other path to the default-tab redirect', () => {
    expect(legacyCorpMembersLocation('/corp/members', '?dark=1')).toBeNull();
    expect(legacyCorpMembersLocation('/corp/members', '?tab=nope')).toBeNull();
    expect(legacyCorpMembersLocation('/corp/members/roles', '?tab=roles')).toBeNull();
  });
});
