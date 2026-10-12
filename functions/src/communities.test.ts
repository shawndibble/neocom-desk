import { describe, expect, it } from 'vitest';
import {
  MAX_COMMUNITIES_PER_CHARACTER,
  MAX_COMMUNITY_MEMBERS,
  decideCreate,
  decideJoin,
  decideLeave,
  decideRemoveMember,
  decideTransferAdmin,
  parseTransferAdminInput,
  newInviteCode,
  parseCommunityIdInput,
  parseCreateInput,
  parseJoinInput,
  parsePreviewInput,
  parseRemoveMemberInput,
} from './communities.js';

describe('input parsing', () => {
  it('parses create input, trimming', () => {
    expect(parseCreateInput({ name: '  Pals ', characterName: 'One' })).toEqual({
      name: 'Pals',
      characterName: 'One',
    });
  });

  it.each([
    undefined,
    null,
    {},
    { name: '', characterName: 'One' },
    { name: '   ', characterName: 'One' },
    { name: 'x'.repeat(61), characterName: 'One' },
    { name: 'Pals', characterName: '' },
    { name: 'Pals', characterName: 'x'.repeat(101) },
    { name: 5, characterName: 'One' },
  ])('rejects bad create input %j', (input) => {
    expect(() => parseCreateInput(input)).toThrow();
  });

  it('parses join input', () => {
    expect(parseJoinInput({ inviteCode: 'abc123', characterName: 'Two' })).toEqual({
      inviteCode: 'abc123',
      characterName: 'Two',
    });
    expect(() => parseJoinInput({ inviteCode: '', characterName: 'Two' })).toThrow();
    expect(() => parseJoinInput({ inviteCode: 'x'.repeat(65), characterName: 'Two' })).toThrow();
    expect(() => parseJoinInput({ inviteCode: 'abc', characterName: '' })).toThrow();
  });

  it('parses a community id, rejecting path characters', () => {
    expect(parseCommunityIdInput({ communityId: 'abc123' })).toEqual({ communityId: 'abc123' });
    for (const bad of [{}, { communityId: '' }, { communityId: 'a/b' }, { communityId: 5 }]) {
      expect(() => parseCommunityIdInput(bad)).toThrow();
    }
  });

  it('parses remove-member input, requiring a char: uid', () => {
    expect(parseRemoveMemberInput({ communityId: 'c1', memberUid: 'char:2' })).toEqual({
      communityId: 'c1',
      memberUid: 'char:2',
    });
    expect(() => parseRemoveMemberInput({ communityId: 'c1', memberUid: 'bob' })).toThrow();
    expect(() => parseRemoveMemberInput({ communityId: 'c1', memberUid: 'char:2/x' })).toThrow();
  });
});

describe('newInviteCode', () => {
  it('is URL-safe, long enough to be unguessable, and unique per call', () => {
    const a = newInviteCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(newInviteCode()).not.toBe(a);
  });
});

describe('decideCreate', () => {
  it('allows below the cap and refuses at it', () => {
    expect(decideCreate(MAX_COMMUNITIES_PER_CHARACTER - 1)).toBe('ok');
    expect(decideCreate(MAX_COMMUNITIES_PER_CHARACTER)).toBe('too-many-communities');
  });
});

describe('decideJoin', () => {
  const base = { inviteMatches: true, alreadyMember: false, memberCount: 3, joinedCount: 2 };

  it('allows a normal join', () => {
    expect(decideJoin(base)).toBe('ok');
  });
  it('refuses a revoked or wrong invite', () => {
    expect(decideJoin({ ...base, inviteMatches: false })).toBe('invalid-invite');
  });
  it('treats an existing Member as already joined, before any cap', () => {
    expect(decideJoin({ ...base, alreadyMember: true, memberCount: MAX_COMMUNITY_MEMBERS })).toBe(
      'already-member'
    );
  });
  it('refuses a full Community', () => {
    expect(decideJoin({ ...base, memberCount: MAX_COMMUNITY_MEMBERS })).toBe('community-full');
    expect(decideJoin({ ...base, memberCount: MAX_COMMUNITY_MEMBERS - 1 })).toBe('ok');
  });
  it('refuses a Character already in 10 Communities', () => {
    expect(decideJoin({ ...base, joinedCount: MAX_COMMUNITIES_PER_CHARACTER })).toBe(
      'too-many-communities'
    );
  });
});

describe('decideLeave', () => {
  it('lets a Member leave but not the admin', () => {
    expect(decideLeave({ adminUid: 'char:1', callerUid: 'char:2', isMember: true })).toBe('ok');
    expect(decideLeave({ adminUid: 'char:1', callerUid: 'char:1', isMember: true })).toBe(
      'admin-cannot-leave'
    );
    expect(decideLeave({ adminUid: 'char:1', callerUid: 'char:3', isMember: false })).toBe(
      'not-a-member'
    );
  });
});

describe('decideRemoveMember', () => {
  it('lets only the admin remove, and never themselves', () => {
    const base = {
      adminUid: 'char:1',
      callerUid: 'char:1',
      targetUid: 'char:2',
      targetIsMember: true,
    };
    expect(decideRemoveMember(base)).toBe('ok');
    expect(decideRemoveMember({ ...base, callerUid: 'char:2' })).toBe('not-admin');
    expect(decideRemoveMember({ ...base, targetUid: 'char:1' })).toBe('cannot-remove-admin');
    expect(decideRemoveMember({ ...base, targetIsMember: false })).toBe('not-a-member');
  });
});

describe('decideTransferAdmin', () => {
  const base = {
    adminUid: 'char:1',
    callerUid: 'char:1',
    targetUid: 'char:2',
    targetIsMember: true,
  };
  it('lets only the admin hand over, to another current Member', () => {
    expect(decideTransferAdmin(base)).toBe('ok');
    expect(decideTransferAdmin({ ...base, callerUid: 'char:2' })).toBe('not-admin');
    expect(decideTransferAdmin({ ...base, targetUid: 'char:1' })).toBe('already-admin');
    expect(decideTransferAdmin({ ...base, targetIsMember: false })).toBe('not-a-member');
  });
  it('parses like remove-member input', () => {
    expect(parseTransferAdminInput({ communityId: 'c1', memberUid: 'char:2' })).toEqual({
      communityId: 'c1',
      memberUid: 'char:2',
    });
    expect(() => parseTransferAdminInput({ communityId: 'c1', memberUid: 'bob' })).toThrow();
  });
});

describe('parsePreviewInput', () => {
  it('takes an invite code and nothing else', () => {
    expect(parsePreviewInput({ inviteCode: ' abc ', extra: 1 })).toEqual({ inviteCode: 'abc' });
    for (const bad of [undefined, {}, { inviteCode: '' }, { inviteCode: 'x'.repeat(65) }]) {
      expect(() => parsePreviewInput(bad)).toThrow();
    }
  });
});
