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
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async (id: number) => `char:${id}` }));
const routed = vi.hoisted(() => ({ callRouted: vi.fn() }));
vi.mock('@/sync/routedCallable', () => routed);

import {
  MY_COMMUNITIES_TTL_MS,
  callCommunity,
  invalidateMyCommunities,
  joinCommunity,
  loadMyCommunities,
  loadMyCommunitiesCached,
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
