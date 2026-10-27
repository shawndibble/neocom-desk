import { describe, expect, it } from 'vitest';
import {
  MAX_COMMUNITIES_PER_CHARACTER,
  MAX_COMMUNITY_MEMBERS,
  decideCreate,
  decideAdmit,
  isPreApproved,
  decideJoin,
  decideMailInvite,
  decideMailRelease,
  MAIL_MAX_ATTEMPTS_PER_TARGET,
  MAIL_RELEASE_BUDGET_PER_DAY,
  MAIL_RELEASE_WINDOW_MS,
  MAIL_RESERVATION_STALE_MS,
  MAX_MAIL_INVITES_PER_DAY,
  parseJoinRequestDecisionInput,
  parseMailInviteInput,
  parseRequireApprovalInput,
  utcDayKey,
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

  describe('when the Community approves new Members', () => {
    const gated = { ...base, requiresApproval: true };

    it('holds a join for approval', () => {
      expect(decideJoin(gated)).toBe('needs-approval');
    });
    it('lets a Character the admin mailed an invite straight in', () => {
      expect(decideJoin({ ...gated, preApproved: true })).toBe('ok');
    });
    it('still treats an existing Member as already joined', () => {
      expect(decideJoin({ ...gated, alreadyMember: true })).toBe('already-member');
    });
    it('does not queue a request into a full Community or past the Character cap', () => {
      expect(decideJoin({ ...gated, memberCount: MAX_COMMUNITY_MEMBERS })).toBe('community-full');
      expect(decideJoin({ ...gated, joinedCount: MAX_COMMUNITIES_PER_CHARACTER })).toBe(
        'too-many-communities'
      );
    });
    it('still refuses a revoked invite first', () => {
      expect(decideJoin({ ...gated, inviteMatches: false })).toBe('invalid-invite');
    });
  });
});

describe('isPreApproved (a mailed invite standing in for approval)', () => {
  const sent = { adminUid: 'char:1', sentAt: 5, consumedAt: null };

  it('counts a sent invite from the current admin', () => {
    expect(isPreApproved(sent, 'char:1')).toBe(true);
  });
  it('does not count a reservation the mail never went out for', () => {
    expect(isPreApproved({ ...sent, sentAt: null }, 'char:1')).toBe(false);
  });
  it('does not count an invite from a former admin', () => {
    expect(isPreApproved(sent, 'char:2')).toBe(false);
  });
  it('is spent once the Character has joined on it, so leaving or removal does not keep it open', () => {
    expect(isPreApproved({ ...sent, consumedAt: 9 }, 'char:1')).toBe(false);
  });
  it('is not there when no invite was ever mailed', () => {
    expect(isPreApproved(null, 'char:1')).toBe(false);
  });
});

describe('decideAdmit (accepting a waiting request)', () => {
  const base = { memberCount: 3, joinedCount: 2, alreadyMember: false };

  it('admits a waiting Character', () => {
    expect(decideAdmit(base)).toBe('ok');
  });
  it('treats someone who became a Member meanwhile as already admitted', () => {
    expect(decideAdmit({ ...base, alreadyMember: true })).toBe('already-member');
  });
  it('stops at the Community and Character caps', () => {
    expect(decideAdmit({ ...base, memberCount: MAX_COMMUNITY_MEMBERS })).toBe('community-full');
    expect(decideAdmit({ ...base, joinedCount: MAX_COMMUNITIES_PER_CHARACTER })).toBe(
      'too-many-communities'
    );
  });
});

describe('approval input parsing', () => {
  it('parses the approval switch', () => {
    expect(parseRequireApprovalInput({ communityId: 'c1', requireApproval: true })).toEqual({
      communityId: 'c1',
      requireApproval: true,
    });
  });
  it('rejects a switch that is not a boolean', () => {
    expect(() =>
      parseRequireApprovalInput({ communityId: 'c1', requireApproval: 'yes' })
    ).toThrow();
  });
  it('parses a decision on a waiting request', () => {
    expect(
      parseJoinRequestDecisionInput({ communityId: 'c1', memberUid: 'char:9', accept: false })
    ).toEqual({ communityId: 'c1', memberUid: 'char:9', accept: false });
  });
  it('rejects a decision with no accept flag or a path-escaping uid', () => {
    expect(() =>
      parseJoinRequestDecisionInput({ communityId: 'c1', memberUid: 'char:9' })
    ).toThrow();
    expect(() =>
      parseJoinRequestDecisionInput({ communityId: 'c1', memberUid: 'a/b', accept: true })
    ).toThrow();
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

describe('mail invites', () => {
  it('parses a target Character id and name', () => {
    expect(
      parseMailInviteInput({ communityId: 'c1', targetCharacterId: 42, targetName: ' Bob ' })
    ).toEqual({ communityId: 'c1', targetCharacterId: 42, targetName: 'Bob' });
    for (const bad of [
      { communityId: 'c1', targetCharacterId: 0, targetName: 'Bob' },
      { communityId: 'c1', targetCharacterId: 1.5, targetName: 'Bob' },
      { communityId: 'c1', targetCharacterId: '42', targetName: 'Bob' },
      { communityId: 'c1', targetCharacterId: 42, targetName: '' },
      { communityId: 'a/b', targetCharacterId: 42, targetName: 'Bob' },
    ]) {
      expect(() => parseMailInviteInput(bad)).toThrow();
    }
  });

  it('counts a day in UTC', () => {
    expect(utcDayKey(Date.UTC(2026, 9, 12, 23, 59, 59))).toBe('2026-10-12');
    expect(utcDayKey(Date.UTC(2026, 9, 13, 0, 0, 0))).toBe('2026-10-13');
  });

  const NOW = 10_000_000;
  const reserved = (
    over: Partial<{ sentAt: number | null; reservedAt: number; attempts: number }> = {}
  ) => ({ sentAt: null, reservedAt: NOW, attempts: 1, ...over });

  it('allows up to the daily cap', () => {
    const state = { existing: null, now: NOW };
    expect(decideMailInvite({ ...state, dailyCount: MAX_MAIL_INVITES_PER_DAY - 1 })).toBe('ok');
    expect(decideMailInvite({ ...state, dailyCount: MAX_MAIL_INVITES_PER_DAY })).toBe('daily-cap');
  });

  it('reports a repeat target before the cap', () => {
    expect(
      decideMailInvite({
        dailyCount: MAX_MAIL_INVITES_PER_DAY,
        existing: reserved({ sentAt: 1 }),
        now: NOW,
      })
    ).toBe('already-invited');
  });

  it('lets a stale unconfirmed reservation be taken again, a few times, never a sent one', () => {
    const later = NOW + MAIL_RESERVATION_STALE_MS;
    const at = (existing: ReturnType<typeof reserved>, now: number) =>
      decideMailInvite({ dailyCount: 5, existing, now });
    expect(at(reserved(), NOW + 1000)).toBe('already-invited');
    expect(at(reserved(), later)).toBe('retake');
    expect(at(reserved({ attempts: MAIL_MAX_ATTEMPTS_PER_TARGET }), later)).toBe('already-invited');
    expect(at(reserved({ sentAt: 1 }), later)).toBe('already-invited');
  });

  it('refunds only a fresh, unconfirmed reservation, within a small daily budget', () => {
    const at = (existing: ReturnType<typeof reserved>, refundsToday: number, now: number) =>
      decideMailRelease({ existing, refundsToday, now });
    expect(at(reserved(), 0, NOW + 1000)).toBe('refund');
    expect(at(reserved(), 0, NOW + MAIL_RELEASE_WINDOW_MS + 1)).toBe('keep');
    expect(at(reserved({ sentAt: 5 }), 0, NOW)).toBe('keep');
    expect(at(reserved(), MAIL_RELEASE_BUDGET_PER_DAY, NOW)).toBe('keep');
  });
});
