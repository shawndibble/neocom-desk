import { describe, expect, it } from 'vitest';
import {
  diffCommunityJoinRequest,
  diffCommunityRequestPledged,
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

describe('pledge entries beside the admin ones', () => {
  it('do not make a community "known" to the admin diffs', () => {
    const prev = snap(entry({ kind: 'pledgeRequest', requestId: 'r1', uid: 'me' }));
    const next = snap(
      entry({ kind: 'pledgeRequest', requestId: 'r1', uid: 'me' }),
      entry({ kind: 'member', uid: 'u2' }),
      entry({ kind: 'request', uid: 'u3' })
    );
    expect(diffCommunityMemberJoined(1, prev, next)).toEqual([]);
    expect(diffCommunityJoinRequest(1, prev, next)).toEqual([]);
  });

  it('are not mistaken for a Member of the same uid', () => {
    const prev = snap(entry({ kind: 'pledge', requestId: 'r1', uid: 'u2' }));
    const next = snap(entry({ kind: 'pledge', requestId: 'r1', uid: 'u2' }), entry({ uid: 'u2' }));
    expect(diffCommunityMemberJoined(1, prev, next)).toEqual([]);
  });
});

describe('diffCommunityRequestPledged', () => {
  const mine = (over: Partial<CommunityAlertEntry> = {}) =>
    entry({
      kind: 'pledgeRequest',
      uid: 'me',
      requestId: 'r1',
      requestLabel: 'Tritanium',
      at: 50,
      ...over,
    });
  const pledge = (over: Partial<CommunityAlertEntry> = {}) =>
    entry({
      kind: 'pledge',
      uid: 'u2',
      characterName: 'Bob',
      requestId: 'r1',
      requestLabel: 'Tritanium',
      at: 200,
      ...over,
    });
  const at = (nowMs: number, ...entries: CommunityAlertEntry[]): CommunityAlertSnapshot => ({
    entries,
    nowMs,
  });

  it('stays quiet on the first poll', () => {
    expect(diffCommunityRequestPledged(1, undefined, at(1000, mine(), pledge()))).toEqual([]);
  });

  it('fires once for a Pledger who was not on a known Request before', () => {
    const prev = at(1000, mine());
    const next = at(2000, mine(), pledge());
    expect(diffCommunityRequestPledged(7, prev, next)).toEqual([
      {
        eventId: 'communityRequestPledged',
        characterId: 7,
        communityId: 'c1',
        communityName: 'Efa Miners',
        uid: 'u2',
        characterName: 'Bob',
        requestId: 'r1',
        requestLabel: 'Tritanium',
        count: 1,
        at: 200,
      },
    ]);
  });

  it('does not repeat a Pledge already seen, nor fire for an update of it', () => {
    const prev = at(1000, mine(), pledge({ at: 100 }));
    const next = at(2000, mine(), pledge({ at: 900 }));
    expect(diffCommunityRequestPledged(1, prev, next)).toEqual([]);
  });

  it('counts a Request absent from the previous poll as watched with nothing Pledged, whatever the clocks say', () => {
    const prev = at(1000, mine({ requestId: 'r0' }));
    // createdAt is the server's clock: far in the past of this device's, and it makes no difference.
    const next = at(2000, mine({ requestId: 'r0' }), mine({ requestId: 'r1', at: 10 }), pledge());
    expect(diffCommunityRequestPledged(1, prev, next)).toHaveLength(1);
    const ahead = at(
      2000,
      mine({ requestId: 'r0' }),
      mine({ requestId: 'r1', at: 9e12 }),
      pledge()
    );
    expect(diffCommunityRequestPledged(1, prev, ahead)).toHaveLength(1);
  });

  it('does not repeat a Pledge when a Request drops out of one poll and returns', () => {
    const prev = at(1000, mine(), pledge({ at: 100 }));
    expect(diffCommunityRequestPledged(1, prev, at(2000, mine(), pledge({ at: 100 })))).toEqual([]);
  });

  it('ignores a Pledge whose Request is not being watched', () => {
    const prev = at(1000, mine());
    const next = at(2000, mine(), pledge({ requestId: 'r9' }));
    expect(diffCommunityRequestPledged(1, prev, next)).toEqual([]);
  });

  it('groups several new Pledges of a Community into one fire, naming the latest', () => {
    const prev = at(1000, mine(), mine({ requestId: 'r2', requestLabel: 'Pyerite' }));
    const next = at(
      2000,
      mine(),
      mine({ requestId: 'r2', requestLabel: 'Pyerite' }),
      pledge({ at: 300 }),
      pledge({ uid: 'u3', characterName: 'Cy', requestId: 'r2', requestLabel: 'Pyerite', at: 400 })
    );
    expect(diffCommunityRequestPledged(1, prev, next)).toEqual([
      expect.objectContaining({
        communityId: 'c1',
        count: 2,
        uid: 'u3',
        characterName: 'Cy',
        requestId: 'r2',
        requestLabel: 'Pyerite',
        at: 400,
      }),
    ]);
  });

  it('fires per Community', () => {
    const prev = at(1000, mine(), mine({ communityId: 'c2', communityName: 'Other' }));
    const next = at(
      2000,
      mine(),
      mine({ communityId: 'c2', communityName: 'Other' }),
      pledge(),
      pledge({ communityId: 'c2', communityName: 'Other' })
    );
    expect(diffCommunityRequestPledged(1, prev, next).map((f) => f.communityId)).toEqual([
      'c1',
      'c2',
    ]);
  });
});
