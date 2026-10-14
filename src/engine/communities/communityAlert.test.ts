import { describe, expect, it } from 'vitest';
import {
  diffCommunityJoinRequest,
  diffCommunityMemberJoined,
  type CommunityAlertEntry,
  type CommunityAlertSnapshot,
} from './communityAlert';

const entry = (over: Partial<CommunityAlertEntry>): CommunityAlertEntry => ({
  communityId: 'c1',
  communityName: 'Efa Miners',
  kind: 'member',
  uid: 'u1',
  characterName: 'Alice',
  at: 100,
  ...over,
});
const snap = (...entries: CommunityAlertEntry[]): CommunityAlertSnapshot => ({
  entries,
  nowMs: 0,
});

describe('diffCommunityJoinRequest', () => {
  it('stays quiet on the first poll', () => {
    expect(diffCommunityJoinRequest(1, undefined, snap(entry({ kind: 'request' })))).toEqual([]);
  });

  it('fires once for a request that was not waiting before', () => {
    const prev = snap(entry({ kind: 'request', uid: 'u1' }));
    const next = snap(
      entry({ kind: 'request', uid: 'u1' }),
      entry({ kind: 'request', uid: 'u2', characterName: 'Bob' })
    );
    expect(diffCommunityJoinRequest(7, prev, next)).toEqual([
      {
        eventId: 'communityJoinRequest',
        characterId: 7,
        communityId: 'c1',
        communityName: 'Efa Miners',
        uid: 'u2',
        characterName: 'Bob',
        at: 100,
      },
    ]);
  });

  it('ignores members and a request that has left the list', () => {
    const prev = snap(entry({ kind: 'request', uid: 'u1' }));
    const next = snap(entry({ kind: 'member', uid: 'u1' }));
    expect(diffCommunityJoinRequest(1, prev, next)).toEqual([]);
  });

  it('treats the same uid in a community already watched as new', () => {
    const prev = snap(entry({ kind: 'member', communityId: 'c1', uid: 'u1' }));
    const next = snap(
      entry({ kind: 'member', communityId: 'c1', uid: 'u1' }),
      entry({ kind: 'request', communityId: 'c1', uid: 'u3' })
    );
    expect(diffCommunityJoinRequest(1, prev, next)).toHaveLength(1);
  });

  it('stays quiet about requests already waiting in a community only just administered', () => {
    const prev = snap();
    const next = snap(entry({ kind: 'request', communityId: 'c2' }));
    expect(diffCommunityJoinRequest(1, prev, next)).toEqual([]);
  });
});

describe('diffCommunityMemberJoined', () => {
  it('stays quiet on the first poll', () => {
    expect(diffCommunityMemberJoined(1, undefined, snap(entry({})))).toEqual([]);
  });

  it('fires for a Member who was not in the community before', () => {
    const prev = snap(entry({ uid: 'u1' }));
    const next = snap(entry({ uid: 'u1' }), entry({ uid: 'u2', characterName: 'Bob' }));
    expect(diffCommunityMemberJoined(7, prev, next)).toEqual([
      {
        eventId: 'communityMemberJoined',
        characterId: 7,
        communityId: 'c1',
        communityName: 'Efa Miners',
        uid: 'u2',
        characterName: 'Bob',
        at: 100,
      },
    ]);
  });

  it('does not repeat a join the request alert already announced', () => {
    const prev = snap(entry({ kind: 'request', uid: 'u2' }));
    const next = snap(entry({ kind: 'member', uid: 'u2' }));
    expect(diffCommunityMemberJoined(1, prev, next)).toEqual([]);
  });

  it('stays quiet about a community the pilot only just came to administer', () => {
    const prev = snap(entry({ communityId: 'c1' }));
    const next = snap(
      entry({ communityId: 'c1' }),
      entry({ communityId: 'c2', uid: 'u9', communityName: 'New' })
    );
    expect(diffCommunityMemberJoined(1, prev, next)).toEqual([]);
  });
});
