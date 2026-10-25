import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (base: { path?: string } | unknown, ...path: string[]) => ({
    path: [(base as { path?: string }).path, ...path].filter(Boolean).join('/'),
  }),
  getDocs: fs.getDocs,
  getDoc: fs.getDoc,
  setDoc: fs.setDoc,
  deleteDoc: fs.deleteDoc,
  query: (base: unknown) => base,
  where: () => ({}),
  writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
  serverTimestamp: () => 'now',
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async (id: number) => `char:${id}` }));
vi.mock('@/db', () => ({
  db: { characters: { get: async () => ({ ownerHash: 'h1' }) }, fittings: { get: vi.fn() } },
}));
vi.mock('@/engine/fittings/fittingShare', () => ({
  decodeFittingShare: async () => ({ ok: true, value: { hullTypeId: 587 } }),
}));
vi.mock('@/sde/loadSde', () => ({ loadTypes: async () => ({ 587: { name: 'Rifter' } }) }));
vi.mock('./shareSelection', () => ({
  loadFittingsAll: vi.fn(),
  markFittingsShared: vi.fn(async () => {}),
}));
const community = { id: 'c1', name: 'One', adminUid: 'char:9', inviteCode: null, memberCount: 2 };
vi.mock('./communityStore', () => ({
  withMyCommunities: async (_id: number, read: (list: unknown[]) => Promise<unknown>) =>
    read([community]),
  loadCommunityMembersCached: async () => [],
  loadMyCommunities: async () => [community],
}));

import { dropCached } from './readCache';
import {
  SHARED_FITTINGS_TTL_MS,
  loadCommunityFittingsCached,
  loadShareStatus,
  loadSharedFittings,
  shareFitting,
} from './sharedFittings';

const NOW = 1_000_000;
const fittingDoc = (id: string) => ({
  id,
  data: () => ({ code: 'x', name: 'Fit', hull: 'Rifter', updatedAt: { toMillis: () => 5 } }),
});
const listReads = () => fs.getDocs.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  dropCached();
  fs.getDocs.mockResolvedValue({ docs: [fittingDoc('char:1~saved-f1')] });
});

describe('shared Fittings cache', () => {
  it('reuses a Community’s list for the TTL', async () => {
    await loadCommunityFittingsCached(1, 'c1', NOW);
    await loadCommunityFittingsCached(1, 'c1', NOW + SHARED_FITTINGS_TTL_MS - 1);
    expect(listReads()).toBe(1);
    await loadCommunityFittingsCached(1, 'c1', NOW + SHARED_FITTINGS_TTL_MS);
    expect(listReads()).toBe(2);
  });

  it('a repeat start-screen load within the TTL reads nothing', async () => {
    await loadSharedFittings(1);
    await loadSharedFittings(1);
    expect(listReads()).toBe(1);
  });

  it('the editor’s share status comes from that list, not one read per Community', async () => {
    const shared = await loadShareStatus(1, { source: 'saved', key: 'f1' });
    const other = await loadShareStatus(1, { source: 'saved', key: 'f9' });
    expect(fs.getDoc).not.toHaveBeenCalled();
    expect(listReads()).toBe(1);
    expect([...shared.sharedIn]).toEqual(['c1']);
    expect([...other.sharedIn]).toEqual([]);
  });

  it('this device’s own share drops the list, so the next read sees it', async () => {
    await loadCommunityFittingsCached(1, 'c1', NOW);
    await shareFitting(1, 'c1', { source: 'saved', key: 'f2', name: 'New', code: 'abc' });
    expect(fs.setDoc).toHaveBeenCalledOnce();
    await loadCommunityFittingsCached(1, 'c1', NOW);
    expect(listReads()).toBe(2);
  });

  it('a share that failed still drops the list: it may have landed', async () => {
    await loadCommunityFittingsCached(1, 'c1', NOW);
    fs.setDoc.mockRejectedValueOnce(new Error('deadline-exceeded'));
    await expect(
      shareFitting(1, 'c1', { source: 'saved', key: 'f2', name: 'New', code: 'abc' })
    ).rejects.toThrow();
    await loadCommunityFittingsCached(1, 'c1', NOW);
    expect(listReads()).toBe(2);
  });
});
