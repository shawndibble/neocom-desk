import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocs: fs.getDocs,
  getDoc: fs.getDoc,
  query: (base: { path: string }, ...parts: unknown[]) => ({ ...base, parts }),
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  limit: (n: number) => ['limit', n],
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async (id: number) => `char:${id}` }));
const routed = vi.hoisted(() => ({ callRouted: vi.fn() }));
vi.mock('@/sync/routedCallable', () => routed);

import {
  MAIL_INVITES_SHOWN,
  MY_COMMUNITIES_TTL_MS,
  ROSTER_TTL_MS,
  callCommunity,
  invalidateCommunityRoster,
  invalidateMyCommunities,
  joinCommunity,
  loadCommunityMembers,
  loadCommunityMembersCached,
  loadMailInviteStatus,
  loadMemberLibrariesFor,
  loadMyCommunities,
  loadMyCommunitiesCached,
  withMyCommunities,
} from './communityStore';

const NOW = 1_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  invalidateMyCommunities();
  fs.getDocs.mockResolvedValue({ docs: [{ id: 'c1' }] });
  fs.getDoc.mockResolvedValue({
    id: 'c1',
    exists: () => true,
    data: () => ({ name: 'One', adminUid: 'char:9', memberCount: 2 }),
  });
  routed.callRouted.mockResolvedValue({});
});

/** Index query + one read per Community: what one fresh load costs. */
const reads = () => fs.getDocs.mock.calls.length + fs.getDoc.mock.calls.length;

describe('loadMyCommunitiesCached', () => {
  it('reuses one read for the TTL, then reads again', async () => {
    expect(await loadMyCommunitiesCached(1, NOW)).toMatchObject([{ id: 'c1', name: 'One' }]);
    expect(reads()).toBe(2);
    await loadMyCommunitiesCached(1, NOW + MY_COMMUNITIES_TTL_MS - 1);
    expect(reads()).toBe(2);
    await loadMyCommunitiesCached(1, NOW + MY_COMMUNITIES_TTL_MS);
    expect(reads()).toBe(4);
  });

  it('shares one read between concurrent callers, and keeps Characters apart', async () => {
    await Promise.all([loadMyCommunitiesCached(1, NOW), loadMyCommunitiesCached(1, NOW)]);
    expect(reads()).toBe(2);
    await loadMyCommunitiesCached(2, NOW);
    expect(reads()).toBe(4);
  });

  it('does not keep a failed read', async () => {
    fs.getDocs.mockRejectedValueOnce(new Error('offline'));
    await expect(loadMyCommunitiesCached(1, NOW)).rejects.toThrow('offline');
    expect(await loadMyCommunitiesCached(1, NOW)).toHaveLength(1);
  });

  it('is refreshed by a fresh load', async () => {
    await loadMyCommunitiesCached(1, NOW);
    fs.getDoc.mockResolvedValue({
      id: 'c1',
      exists: () => true,
      data: () => ({ name: 'Renamed', adminUid: 'char:9', memberCount: 3 }),
    });
    await loadMyCommunities(1);
    const before = reads();
    expect(await loadMyCommunitiesCached(1, Date.now())).toMatchObject([{ name: 'Renamed' }]);
    expect(reads()).toBe(before);
  });

  it('is dropped by a call that changes the Character’s Communities, even a failed one', async () => {
    await loadMyCommunitiesCached(1, NOW);
    await joinCommunity(1, 'code', 'Pilot');
    await loadMyCommunitiesCached(1, NOW);
    expect(reads()).toBe(4);

    routed.callRouted.mockRejectedValueOnce(new Error('deadline-exceeded'));
    await expect(joinCommunity(1, 'code', 'Pilot')).rejects.toThrow();
    await loadMyCommunitiesCached(1, NOW);
    expect(reads()).toBe(6);
  });

  it('is kept by a call that changes nothing in the summaries', async () => {
    await loadMyCommunitiesCached(1, NOW);
    await callCommunity(1, 'editCommunityRequestCallable', {});
    await loadMyCommunitiesCached(1, NOW);
    expect(reads()).toBe(2);
  });
});

describe('withMyCommunities', () => {
  it('reruns over a fresh list when a Community refuses this Member (left or removed elsewhere)', async () => {
    await loadMyCommunitiesCached(1, NOW);
    fs.getDocs.mockResolvedValue({ docs: [] }); // removed from c1 on another device
    const seen: string[][] = [];
    const result = await withMyCommunities(
      1,
      async (list) => {
        seen.push(list.map((c) => c.id));
        if (list.some((c) => c.id === 'c1')) {
          throw Object.assign(new Error('Missing or insufficient permissions.'), {
            code: 'permission-denied',
          });
        }
        return 'ok';
      },
      NOW
    );
    expect(result).toBe('ok');
    expect(seen).toEqual([['c1'], []]);
    // The fresh list is what the cache holds now.
    expect(await loadMyCommunitiesCached(1, NOW)).toEqual([]);
  });

  it('passes any other failure through without rereading', async () => {
    await loadMyCommunitiesCached(1, NOW);
    await expect(
      withMyCommunities(1, async () => Promise.reject(new Error('offline')), NOW)
    ).rejects.toThrow('offline');
    expect(reads()).toBe(2);
  });
});

describe('the badge interval', () => {
  it('outlives two badge ticks, so a warm list serves at least every other one', () => {
    expect(MY_COMMUNITIES_TTL_MS).toBeGreaterThanOrEqual(2 * 5 * 60_000);
  });
});

describe('rosters and libraries', () => {
  const stamp = (ms: number) => ({ toMillis: () => ms });
  const memberDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
  const rosterReads = () =>
    fs.getDocs.mock.calls.filter(([ref]) => String(ref.path).endsWith('/members')).length;
  const libraryReads = () =>
    fs.getDocs.mock.calls.filter(([ref]) => String(ref.path).endsWith('/library')).length;

  beforeEach(() => {
    fs.getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith('/members')) {
        return {
          docs: [
            memberDoc('char:2', { characterName: 'Two', pushedAt: stamp(100), chunkCount: 1 }),
            memberDoc('char:3', { characterName: 'Three' }), // shares nothing
            memberDoc('char:4', { characterName: 'Four', pushedAt: stamp(50), chunkCount: 0 }),
          ],
        };
      }
      if (ref.path.endsWith('/library')) {
        return { docs: [{ data: () => ({ items: [{ typeId: 1 }] }) }] };
      }
      return { docs: [] };
    });
  });

  it('reuses a roster for its TTL, and a fresh read refreshes it', async () => {
    await loadCommunityMembersCached(1, 'c1', NOW);
    await loadCommunityMembersCached(1, 'c1', NOW + ROSTER_TTL_MS - 1);
    expect(rosterReads()).toBe(1);
    await loadCommunityMembersCached(1, 'c1', NOW + ROSTER_TTL_MS);
    expect(rosterReads()).toBe(2);
    await loadCommunityMembers(1, 'c1');
    await loadCommunityMembersCached(1, 'c1', Date.now());
    expect(rosterReads()).toBe(3);
  });

  it('drops a roster after this Character pushed there, and everything on a membership change', async () => {
    await loadCommunityMembersCached(1, 'c1', NOW);
    invalidateCommunityRoster(1, 'c1');
    await loadCommunityMembersCached(1, 'c1', NOW);
    expect(rosterReads()).toBe(2);
    invalidateMyCommunities(1);
    await loadCommunityMembersCached(1, 'c1', NOW);
    expect(rosterReads()).toBe(3);
  });

  it('reads no library for a Member who shares nothing, and one only when its stamp moved', async () => {
    const roster = await loadCommunityMembersCached(1, 'c1', NOW);
    const first = await loadMemberLibrariesFor(1, 'c1', roster);
    expect(libraryReads()).toBe(1);
    // The roster is by name: Four (a cleared library), Three (never shared), Two.
    expect(first.libraries.map((l) => [l.uid, l.items.length])).toEqual([
      ['char:4', 0],
      ['char:3', 0],
      ['char:2', 1],
    ]);
    await loadMemberLibrariesFor(1, 'c1', roster);
    expect(libraryReads()).toBe(1);
    await loadMemberLibrariesFor(1, 'c1', [{ uid: 'char:2', libraryAsOf: 101 }]);
    expect(libraryReads()).toBe(2);
  });

  it('a library this Character is refused drops its cached Communities', async () => {
    await loadMyCommunitiesCached(1, NOW);
    fs.getDocs.mockRejectedValueOnce(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );
    const read = await loadMemberLibrariesFor(1, 'c1', [{ uid: 'char:2', libraryAsOf: 100 }]);
    expect(read.failedUids).toEqual(['char:2']);
    const indexReads = () =>
      fs.getDocs.mock.calls.filter(([ref]) => String(ref.path).endsWith('/communities')).length;
    const before = indexReads();
    await loadMyCommunitiesCached(1, NOW);
    expect(indexReads()).toBe(before + 1);
  });
});

describe('loadMailInviteStatus', () => {
  it('asks for the newest sent invites only', async () => {
    fs.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    fs.getDocs.mockResolvedValue({ docs: [] });
    await loadMailInviteStatus(1, 'c1', NOW);
    const invites = fs.getDocs.mock.calls.find(([ref]) =>
      String(ref.path).endsWith('/mailInvites')
    )?.[0];
    expect(invites.parts).toEqual([
      ['orderBy', 'sentAt', 'desc'],
      ['limit', MAIL_INVITES_SHOWN],
    ]);
  });
});
