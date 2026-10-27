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
const choice = vi.hoisted(() => ({
  current: { all: false, allowed: new Set([100]) } as
    { all: false; allowed: Set<number> } | { all: true; excluded: Set<number> },
}));
const locations = vi.hoisted(() => ({ current: new Set<number>() }));
vi.mock('./shareSelection', () => ({
  loadBlueprintShare: async () => ({ choice: choice.current, locations: locations.current }),
}));
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
          location_id: 1034000000001,
          location_flag: 'Hangar',
        },
      ],
    },
    needsReauth: false,
  }),
}));
vi.mock('@/features/assets/assets', () => ({
  loadCharacterAssets: async () => ({ cached: { data: [] }, needsReauth: false }),
}));
const location = vi.hoisted(() => vi.fn());
vi.mock('@/features/bpcContracts/blueprintLocation', () => ({
  loadBlueprintLocation: (...args: unknown[]) => location(...args),
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
    choice.current = { all: false, allowed: new Set([100]) };
    locations.current = new Set();
    location.mockResolvedValue({ name: 'Jita IV - Moon 4', systemId: 30000142 });
  });

  it('runs once more when a call arrives mid-flight, so a change is never missed', async () => {
    memberDoc({ ownerHash: 'owner-1' });
    const first = publishSharedLibrary(1, 'c1');
    const second = publishSharedLibrary(1, 'c1');
    const third = publishSharedLibrary(1, 'c1');
    await Promise.all([first, second, third]);
    // The first run, plus one shared by the two that arrived behind it.
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it('publishes the rest and counts a blueprint whose place cannot be read', async () => {
    choice.current = { all: true, excluded: new Set() };
    // Blueprint 100 sits in a readable station, 200 in a structure with no name.
    location.mockImplementation(async (_char: number, id: number) =>
      id === 60003760
        ? { name: 'Jita IV - Moon 4', systemId: 30000142 }
        : { name: null, systemId: null }
    );
    memberDoc({ ownerHash: 'owner-1' });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({
      outcome: 'full',
      skipped: 1,
    });
    expect((setDoc.mock.calls[0]![1] as { items: unknown[] }).items).toEqual(published);
  });

  it('under share-all also publishes a blueprint that was never picked, minus exclusions', async () => {
    choice.current = { all: true, excluded: new Set([200]) };
    memberDoc({ ownerHash: 'owner-1' });
    await publishSharedLibrary(1, 'c1');
    expect((setDoc.mock.calls[0]![1] as { items: unknown[] }).items).toEqual(published);
    choice.current = { all: true, excluded: new Set() };
    await publishSharedLibrary(1, 'c1');
    expect(
      (setDoc.mock.calls[1]![1] as { items: { typeId: number }[] }).items.map((i) => i.typeId)
    ).toEqual([100, 200]);
  });

  it('publishes every blueprint at a shared location, whatever its type', async () => {
    choice.current = { all: false, allowed: new Set() };
    locations.current = new Set([60003760]);
    memberDoc({ ownerHash: 'owner-1' });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({ outcome: 'full' });
    expect((setDoc.mock.calls[0]![1] as { items: unknown[] }).items).toEqual(published);
    // Only the shared location is looked up, and its id is never published.
    expect(location.mock.calls.map((call) => call[1])).toEqual([60003760]);
    expect(JSON.stringify(setDoc.mock.calls[0]![1])).not.toContain('60003760');
  });

  it('adds a location rule to the picked types', async () => {
    location.mockImplementation(async (_char: number, id: number) => ({
      name: id === 60003760 ? 'Jita IV - Moon 4' : 'Fort Knox',
      systemId: 30000142,
    }));
    locations.current = new Set([1034000000001]);
    memberDoc({ ownerHash: 'owner-1' });
    await publishSharedLibrary(1, 'c1');
    expect(
      (setDoc.mock.calls[0]![1] as { items: { typeId: number }[] }).items.map((i) => i.typeId)
    ).toEqual([100, 200]);
  });

  it('writes the selected blueprints only, then stamps the Member doc', async () => {
    memberDoc({ ownerHash: 'owner-1' });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({
      outcome: 'full',
      skipped: 0,
    });
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
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({ outcome: 'skip' });
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('only renews the stamp when the list is unchanged but the stamp is old', async () => {
    memberDoc({
      libraryHash: libraryHash(published),
      chunkCount: 1,
      pushedAt: { toMillis: () => Date.now() - 8 * 24 * 60 * 60 * 1000 },
    });
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({ outcome: 'stamp' });
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
    await expect(publishSharedLibrary(1, 'c1')).resolves.toMatchObject({ outcome: 'unavailable' });
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
