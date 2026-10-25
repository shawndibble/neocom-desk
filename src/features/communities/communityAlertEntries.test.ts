import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { uidForCharacter } from '@/sync/uid';
import { loadCommunityAlertEntries, rememberCommunityAdmin } from './communityAlertEntries';
import { rememberCommunityWatch } from './requestBadge';
import { loadCommunityPledges, loadMyRequests } from './requestStore';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import {
  loadCommunityMembers,
  loadJoinRequests,
  loadMyCommunitiesCached,
  type CommunitySummary,
} from './communityStore';

const session = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncAuth: () => ({ currentUser: session.uid ? { uid: session.uid } : null }),
}));
vi.mock('./requestStore', () => ({ loadMyRequests: vi.fn(), loadCommunityPledges: vi.fn() }));
vi.mock('./communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./communityStore')>()),
  loadMyCommunitiesCached: vi.fn(),
  loadJoinRequests: vi.fn(),
  loadCommunityMembers: vi.fn(),
}));

const CHARACTER = 90000001;
const community = (over: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'c1',
  name: 'Efa Miners',
  adminUid: uidForCharacter(CHARACTER),
  inviteCode: null,
  memberCount: 2,
  ...over,
});

beforeEach(async () => {
  await db.settings.clear();
  vi.resetAllMocks();
  session.uid = uidForCharacter(CHARACTER);
  vi.mocked(loadJoinRequests).mockResolvedValue([]);
  vi.mocked(loadCommunityMembers).mockResolvedValue([]);
});

describe('loadCommunityAlertEntries', () => {
  it('reads nothing for a Character not known to administer a Community', async () => {
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadMyCommunitiesCached).not.toHaveBeenCalled();
  });

  it('skips the poll rather than swap the session to another Character', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    session.uid = uidForCharacter(CHARACTER + 1);
    expect(await loadCommunityAlertEntries(CHARACTER)).toBeNull();
    expect(loadMyCommunitiesCached).not.toHaveBeenCalled();
  });

  it('lists waiting requests and Members of each administered Community', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([
      community(),
      community({ id: 'c2', adminUid: 'someone-else' }),
    ]);
    vi.mocked(loadJoinRequests).mockResolvedValue([
      { uid: 'u2', characterName: 'Bob', requestedAt: 1 },
    ]);
    vi.mocked(loadCommunityMembers).mockResolvedValue([
      { uid: 'u1', characterName: 'Alice', joinedAt: 1, libraryAsOf: null },
    ]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([
      {
        communityId: 'c1',
        communityName: 'Efa Miners',
        kind: 'request',
        uid: 'u2',
        characterName: 'Bob',
        at: 1,
      },
      {
        communityId: 'c1',
        communityName: 'Efa Miners',
        kind: 'member',
        uid: 'u1',
        characterName: 'Alice',
        at: 1,
      },
    ]);
    expect(loadJoinRequests).toHaveBeenCalledTimes(1);
  });

  it('refetches the roster only when the Member count moves', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([community({ id: 'c3', memberCount: 1 })]);
    await loadCommunityAlertEntries(CHARACTER);
    await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityMembers).toHaveBeenCalledTimes(1);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([community({ id: 'c3', memberCount: 2 })]);
    await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityMembers).toHaveBeenCalledTimes(2);
  });

  it('forgets a Character that no longer administers anything', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([community({ adminUid: 'other' })]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadMyCommunitiesCached).toHaveBeenCalledTimes(1);
  });
});

describe('loadCommunityAlertEntries: Pledges on my Requests', () => {
  const me = uidForCharacter(CHARACTER);
  const member = (over: Partial<CommunitySummary> = {}) =>
    community({ adminUid: 'someone-else', ...over });
  const request = (over: Partial<CommunityRequest> = {}): CommunityRequest => ({
    id: 'r1',
    ownerUid: me,
    ownerName: 'Me',
    location: '',
    terms: '',
    lines: [{ typeId: 34, name: 'Tritanium', quantity: 10, kind: 'item' }],
    createdAt: 500,
    lastActivityAt: 500,
    expiresAt: Date.now() + 86_400_000,
    closed: false,
    notify: { app: true, mail: false },
    ...over,
  });
  const pledge = (uid: string, updatedAt = 900): RequestPledge => ({
    uid,
    lines: { 0: { quantity: 5, delivered: 0 } },
    updatedAt,
  });

  beforeEach(() => {
    vi.mocked(loadCommunityPledges).mockResolvedValue(new Map());
    vi.mocked(loadMyRequests).mockResolvedValue([]);
  });

  it('reads nothing for a Character in no Community', async () => {
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadMyRequests).not.toHaveBeenCalled();
  });

  it('lists each own open Request that wants the app, and the Pledges on it by others', async () => {
    await rememberCommunityWatch(CHARACTER, [member()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([member()]);
    vi.mocked(loadMyRequests).mockResolvedValue([
      request(),
      request({ id: 'r2', notify: { app: false, mail: true } }),
      request({ id: 'r3', closed: true }),
    ]);
    vi.mocked(loadCommunityPledges).mockResolvedValue(
      new Map([
        ['r1', [pledge('u2'), pledge(me)]],
        ['r2', [pledge('u3')]],
      ])
    );
    vi.mocked(loadCommunityMembers).mockResolvedValue([
      { uid: 'u2', characterName: 'Bob', joinedAt: 1, libraryAsOf: null },
    ]);
    const entries = await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityPledges).toHaveBeenCalledTimes(1);
    expect(loadCommunityPledges).toHaveBeenCalledWith(CHARACTER, 'c1');
    expect(entries).toEqual([
      {
        communityId: 'c1',
        communityName: 'Efa Miners',
        kind: 'pledgeRequest',
        uid: me,
        characterName: '',
        at: 500,
        requestId: 'r1',
        requestLabel: 'Tritanium',
      },
      {
        communityId: 'c1',
        communityName: 'Efa Miners',
        kind: 'pledge',
        uid: 'u2',
        characterName: 'Bob',
        at: 900,
        requestId: 'r1',
        requestLabel: 'Tritanium',
      },
    ]);
  });

  it('reads no Pledges in a Community where none of my Requests wants the app', async () => {
    await rememberCommunityWatch(CHARACTER, [member()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([member()]);
    vi.mocked(loadMyRequests).mockResolvedValue([request({ notify: { app: false, mail: true } })]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadCommunityPledges).not.toHaveBeenCalled();
  });

  it('raises no Pledge alert for a standing buyback: it takes quotes, not Pledges', async () => {
    await rememberCommunityWatch(CHARACTER, [member()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([member()]);
    vi.mocked(loadMyRequests).mockResolvedValue([
      request({
        lines: [],
        expiresAt: 0,
        standing: {
          rate: 90,
          rateBasis: 'buy',
          hubId: 'jita',
          buyerCharacterId: null,
          buyLines: [{ kind: 'group', group: 'ore' }],
        },
      }),
    ]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadCommunityPledges).not.toHaveBeenCalled();
  });

  it('reads the roster once for names it has not seen, and falls back to no name when that fails', async () => {
    await rememberCommunityWatch(CHARACTER, [member()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([member({ id: 'c9' })]);
    vi.mocked(loadMyRequests).mockResolvedValue([request()]);
    vi.mocked(loadCommunityPledges).mockResolvedValue(new Map([['r1', [pledge('u7')]]]));
    vi.mocked(loadCommunityMembers).mockRejectedValue(new Error('offline'));
    const entries = await loadCommunityAlertEntries(CHARACTER);
    expect(entries?.find((e) => e.kind === 'pledge')?.characterName).toBe('');
  });

  it('keeps the admin entries and adds the Pledge ones for a Member who is both', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    await rememberCommunityWatch(CHARACTER, [community()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([community({ id: 'c5', memberCount: 1 })]);
    vi.mocked(loadMyRequests).mockResolvedValue([request()]);
    const entries = await loadCommunityAlertEntries(CHARACTER);
    expect(entries?.map((e) => e.kind)).toEqual(['pledgeRequest']);
  });

  it('does not read the roster again every poll for a Pledger who has left', async () => {
    await rememberCommunityWatch(CHARACTER, [member()]);
    vi.mocked(loadMyCommunitiesCached).mockResolvedValue([member({ id: 'c8' })]);
    vi.mocked(loadMyRequests).mockResolvedValue([request()]);
    vi.mocked(loadCommunityPledges).mockResolvedValue(new Map([['r1', [pledge('gone')]]]));
    vi.mocked(loadCommunityMembers).mockResolvedValue([]);
    await loadCommunityAlertEntries(CHARACTER);
    await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityMembers).toHaveBeenCalledTimes(1);
  });
});
