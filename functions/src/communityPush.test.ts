import { describe, expect, it } from 'vitest';
import { joinRequestFire, memberJoinedFire, requestPledgedFire } from './communityPush.js';

const community = { name: 'Wing', adminUid: 'char:7' };

describe('joinRequestFire', () => {
  it('tells the admin who asked, keyed by when they asked', () => {
    expect(
      joinRequestFire({
        communityId: 'c1',
        community,
        uid: 'char:9',
        request: { characterName: 'Nine', requestedAt: 1000 },
      })
    ).toEqual({
      eventId: 'communityJoinRequest',
      characterId: 7,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      at: 1000,
    });
  });

  it('says nothing without a Community, an admin Character or a request time', () => {
    const request = { characterName: 'Nine', requestedAt: 1000 };
    expect(
      joinRequestFire({ communityId: 'c1', community: null, uid: 'char:9', request })
    ).toBeNull();
    expect(
      joinRequestFire({
        communityId: 'c1',
        community: { name: 'Wing', adminUid: 'someone' },
        uid: 'char:9',
        request,
      })
    ).toBeNull();
    expect(
      joinRequestFire({
        communityId: 'c1',
        community,
        uid: 'char:9',
        request: { characterName: 'Nine' },
      })
    ).toBeNull();
  });
});

describe('memberJoinedFire', () => {
  const member = { characterName: 'Nine', joinedAt: 2000 };

  it('tells the admin about a new Member', () => {
    expect(memberJoinedFire({ communityId: 'c1', community, uid: 'char:9', member })).toEqual({
      eventId: 'communityMemberJoined',
      characterId: 7,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      at: 2000,
    });
  });

  it('stays quiet for the admin founding it and for a Member the admin just let in', () => {
    expect(memberJoinedFire({ communityId: 'c1', community, uid: 'char:7', member })).toBeNull();
    expect(
      memberJoinedFire({
        communityId: 'c1',
        community,
        uid: 'char:9',
        member: { ...member, admittedFrom: 'request' },
      })
    ).toBeNull();
  });
});

describe('requestPledgedFire', () => {
  const request = {
    ownerUid: 'char:5',
    closed: false,
    expiresAt: 10_000,
    notify: { app: true },
    lines: [{ name: 'Rifter' }],
  };
  const base = {
    communityId: 'c1',
    communityName: 'Wing',
    requestId: 'r1',
    request,
    pledgerUid: 'char:9',
    pledgerName: 'Nine',
    pledgedAt: 3000,
    now: 5000,
  };

  it('tells the requester who Pledged on which Request', () => {
    expect(requestPledgedFire(base)).toEqual({
      eventId: 'communityRequestPledged',
      characterId: 5,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      requestId: 'r1',
      requestLabel: 'Rifter',
      count: 1,
      at: 3000,
    });
  });

  it('stays quiet when the Request did not ask for the app, is standing, closed or expired, or is the Pledger’s own', () => {
    expect(
      requestPledgedFire({ ...base, request: { ...request, notify: { app: false } } })
    ).toBeNull();
    expect(requestPledgedFire({ ...base, request: { ...request, standing: true } })).toBeNull();
    expect(requestPledgedFire({ ...base, request: { ...request, closed: true } })).toBeNull();
    expect(requestPledgedFire({ ...base, now: 20_000 })).toBeNull();
    expect(requestPledgedFire({ ...base, pledgerUid: 'char:5' })).toBeNull();
    expect(requestPledgedFire({ ...base, request: null })).toBeNull();
  });

  it('names no one when the Pledger is not on the roster', () => {
    expect(requestPledgedFire({ ...base, pledgerName: '' })?.characterName).toBe('');
  });
});
