import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { uidForCharacter } from '@/sync/uid';
import { loadCommunityAlertEntries, rememberCommunityAdmin } from './communityAlertEntries';
import {
  loadCommunityMembers,
  loadJoinRequests,
  loadMyCommunities,
  type CommunitySummary,
} from './communityStore';

const session = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncAuth: () => ({ currentUser: session.uid ? { uid: session.uid } : null }),
}));
vi.mock('./communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./communityStore')>()),
  loadMyCommunities: vi.fn(),
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
    expect(loadMyCommunities).not.toHaveBeenCalled();
  });

  it('skips the poll rather than swap the session to another Character', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    session.uid = uidForCharacter(CHARACTER + 1);
    expect(await loadCommunityAlertEntries(CHARACTER)).toBeNull();
    expect(loadMyCommunities).not.toHaveBeenCalled();
  });

  it('lists waiting requests and Members of each administered Community', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunities).mockResolvedValue([
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
      },
      {
        communityId: 'c1',
        communityName: 'Efa Miners',
        kind: 'member',
        uid: 'u1',
        characterName: 'Alice',
      },
    ]);
    expect(loadJoinRequests).toHaveBeenCalledTimes(1);
  });

  it('refetches the roster only when the Member count moves', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunities).mockResolvedValue([community({ id: 'c3', memberCount: 1 })]);
    await loadCommunityAlertEntries(CHARACTER);
    await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityMembers).toHaveBeenCalledTimes(1);
    vi.mocked(loadMyCommunities).mockResolvedValue([community({ id: 'c3', memberCount: 2 })]);
    await loadCommunityAlertEntries(CHARACTER);
    expect(loadCommunityMembers).toHaveBeenCalledTimes(2);
  });

  it('forgets a Character that no longer administers anything', async () => {
    await rememberCommunityAdmin(CHARACTER, [community()]);
    vi.mocked(loadMyCommunities).mockResolvedValue([community({ adminUid: 'other' })]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(await loadCommunityAlertEntries(CHARACTER)).toEqual([]);
    expect(loadMyCommunities).toHaveBeenCalledTimes(1);
  });
});
