import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn();
const updateDoc = vi.fn();
const deleteDoc = vi.fn();
const getDoc = vi.fn();
const getDocs = vi.fn();

vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (parent: { path?: string } | unknown, ...path: string[]) => ({
    path: [(parent as { path?: string }).path, ...path].filter(Boolean).join('/'),
  }),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  serverTimestamp: () => 'SERVER_TIME',
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async () => 'uid1' }));
vi.mock('@/db', () => ({
  db: { characters: { get: async () => ({ characterId: 1, ownerHash: 'owner-1' }) } },
}));
vi.mock('./shareSelection', () => ({ loadShareSelection: async () => new Set([100]) }));
vi.mock('@/features/industry/data', () => ({
  loadCharacterBlueprints: async () => ({
    cached: {
      data: [
        {
          item_id: 1,
          type_id: 100,
          runs: -1,
          material_efficiency: 10,
          time_efficiency: 20,
          quantity: -1,
          location_id: 60003760,
          location_flag: 'Hangar',
        },
        {
          item_id: 2,
          type_id: 200,
          runs: -1,
          material_efficiency: 0,
          time_efficiency: 0,
          quantity: -1,
          location_id: 60003760,
          location_flag: 'Hangar',
        },
      ],
    },
    needsReauth: false,
  }),
}));
vi.mock('@/features/character/assets', () => ({
  loadCharacterAssets: async () => ({ cached: { data: [] }, needsReauth: false }),
}));
vi.mock('@/features/bpcContracts/blueprintLocation', () => ({
  loadBlueprintLocation: async () => ({ name: 'Jita IV - Moon 4', systemId: 30000142 }),
}));
vi.mock('@/sde/solarSystems', () => ({
  lookupSolarSystem: async () => ({ name: 'Jita' }),
}));

import { libraryHash } from '@/engine/communities/sharedLibrary';
import { publishSharedLibrary, removeSharedLibraries } from './libraryPush';

const published = [
  { typeId: 100, me: 10, te: 20, runs: -1, locationName: 'Jita IV - Moon 4', systemName: 'Jita' },
];

function memberDoc(data: Record<string, unknown> | null) {
  getDoc.mockResolvedValue({ exists: () => data !== null, data: () => data ?? {} });
}

describe('publishSharedLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the selected blueprints only, then stamps the Member doc', async () => {
    memberDoc({ ownerHash: 'owner-1' });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toBe('full');
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0]![0]).toEqual({ path: 'communities/c1/members/uid1/library/0' });
    expect(setDoc.mock.calls[0]![1]).toEqual({ ownerHash: 'owner-1', items: published });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'communities/c1/members/uid1' },
      { pushedAt: 'SERVER_TIME', libraryHash: libraryHash(published), chunkCount: 1 }
    );
  });

  it('does not write when the hash matches the last push', async () => {
    memberDoc({
      libraryHash: libraryHash(published),
      chunkCount: 1,
      pushedAt: { toMillis: () => Date.now() - 1000 },
    });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toBe('skip');
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('only renews the stamp when the list is unchanged but the stamp is old', async () => {
    memberDoc({
      libraryHash: libraryHash(published),
      chunkCount: 1,
      pushedAt: { toMillis: () => Date.now() - 8 * 24 * 60 * 60 * 1000 },
    });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toBe('stamp');
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('invalidates the stored hash before it rewrites chunks', async () => {
    memberDoc({ ownerHash: 'owner-1' });
    await publishSharedLibrary(1, 'c1');
    expect(updateDoc.mock.calls[0]![1]).toMatchObject({ libraryHash: '' });
    expect(updateDoc.mock.invocationCallOrder[0]).toBeLessThan(setDoc.mock.invocationCallOrder[0]!);
  });

  it('does nothing for a Character that is no longer a Member', async () => {
    memberDoc(null);
    await expect(publishSharedLibrary(1, 'c1')).resolves.toBe('unavailable');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('deletes chunks left over from a longer library', async () => {
    memberDoc({
      libraryHash: 'old',
      chunkCount: 3,
      pushedAt: { toMillis: () => Date.now() },
    });
    await publishSharedLibrary(1, 'c1');
    expect(deleteDoc.mock.calls.map((c) => (c[0] as { path: string }).path)).toEqual([
      'communities/c1/members/uid1/library/1',
      'communities/c1/members/uid1/library/2',
    ]);
  });
});

describe('removeSharedLibraries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes every chunk in every Community and zeroes the stamp', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 'c1' }, { id: 'c2' }] })
      .mockResolvedValueOnce({ docs: [{ ref: 'r0' }, { ref: 'r1' }], size: 2 })
      .mockResolvedValueOnce({ docs: [{ ref: 'r2' }], size: 1 })
      // the second listCommunityIds call inside the loop is not made: ids are read once
      .mockResolvedValue({ docs: [] });
    await removeSharedLibraries(1);
    expect(deleteDoc.mock.calls.map((c) => c[0])).toEqual(['r0', 'r1', 'r2']);
    // Per Community: invalidate the hash, delete chunks, then zero the stamp.
    expect(updateDoc).toHaveBeenCalledTimes(4);
    expect(updateDoc.mock.calls[0]![1]).toMatchObject({ libraryHash: '', chunkCount: 2 });
    expect(updateDoc.mock.calls[1]![1]).toEqual({
      pushedAt: 'SERVER_TIME',
      libraryHash: '',
      chunkCount: 0,
    });
  });
});
