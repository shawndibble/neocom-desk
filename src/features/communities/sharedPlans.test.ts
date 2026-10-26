import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn();
const deleteDoc = vi.fn();
const getDocs = vi.fn();
const limits: number[] = [];

vi.mock('firebase/firestore/lite', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (parent: { path?: string }, ...path: string[]) => ({
    path: [parent.path, ...path].filter(Boolean).join('/'),
  }),
  query: (target: unknown) => target,
  where: () => ({}),
  limit: (n: number) => {
    limits.push(n);
    return {};
  },
  getDocs: (...args: unknown[]) => getDocs(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  serverTimestamp: () => 'SERVER_TIME',
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: async () => 'char:1' }));
vi.mock('./communityStore', () => ({ listCommunityIds: async () => ['c1'] }));

import { db } from '@/db';
import {
  COMMUNITY_PLANS_CAP,
  loadCommunityPlans,
  loadMySharedPlans,
  sharePlan,
  syncSharedPlans,
} from './sharedPlans';

const plan = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Marauder',
  entries: [{ skillTypeID: 3300, targetLevel: 5 }],
  updatedAt: 1000,
  ...over,
});

const docOf = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.characters.clear();
  await db.characters.put({ characterId: 1, name: 'One', ownerHash: 'hash-1', addedAt: 1 });
});

describe('sharePlan', () => {
  it('writes the plan under <uid>~<plan id> with flat entries and the time it was made from', async () => {
    await expect(sharePlan(1, 'c1', plan())).resolves.toBe(true);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'communities/c1/skillPlans/char:1~p1' },
      {
        ownerHash: 'hash-1',
        ownerUid: 'char:1',
        name: 'Marauder',
        entries: [3300, 5, 1],
        sourceUpdatedAt: 1000,
        updatedAt: 'SERVER_TIME',
      }
    );
  });

  it('remembers on this device that something is shared, so the sweep and logout prompt run', async () => {
    await sharePlan(1, 'c1', plan());
    expect(await db.settings.get('communityShare:1:plans')).toBeDefined();
  });

  it('refuses a plan with too many skills, and writes nothing', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ skillTypeID: i + 1, targetLevel: 1 }));
    await expect(sharePlan(1, 'c1', plan({ entries: many }))).resolves.toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('gives a nameless plan a name the rules accept', async () => {
    await sharePlan(1, 'c1', plan({ name: '   ' }));
    expect(setDoc.mock.calls[0]![1]).toMatchObject({ name: '-' });
  });
});

describe('loading', () => {
  it('reads which plans are mine, with the time each copy was made from', async () => {
    getDocs.mockResolvedValue({
      docs: [docOf('char:1~p1', { sourceUpdatedAt: 5 }), docOf('garbage', {})],
    });
    expect(await loadMySharedPlans(1, 'c1')).toEqual(new Map([['p1', 5]]));
  });

  it('decodes every shared plan and skips one that does not decode', async () => {
    getDocs.mockResolvedValue({
      docs: [
        docOf('char:2~a', {
          name: 'Good',
          entries: [3300, 5, 1],
          sourceUpdatedAt: 7,
          updatedAt: { toMillis: () => 9 },
        }),
        docOf('char:2~b', {
          name: 'Bad',
          entries: [1, 2],
          sourceUpdatedAt: 7,
          updatedAt: { toMillis: () => 9 },
        }),
      ],
    });
    limits.length = 0;
    const plans = await loadCommunityPlans(1, 'c1');
    expect(limits).toEqual([COMMUNITY_PLANS_CAP]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      planId: 'a',
      ownerUid: 'char:2',
      name: 'Good',
      entries: [{ skillTypeID: 3300, targetLevel: 5 }],
      updatedAt: 9,
    });
  });
});

describe('syncSharedPlans', () => {
  it('refreshes a shared plan edited since, removes the copy of a deleted one, and shares nothing new', async () => {
    await db.skillPlans.bulkPut([
      { id: 'edited', characterId: 1, name: 'E', entries: [], remapCount: 0, updatedAt: 200 },
      { id: 'same', characterId: 1, name: 'S', entries: [], remapCount: 0, updatedAt: 100 },
      { id: 'private', characterId: 1, name: 'P', entries: [], remapCount: 0, updatedAt: 999 },
    ]);
    getDocs.mockResolvedValue({
      docs: [
        docOf('char:1~edited', { sourceUpdatedAt: 100 }),
        docOf('char:1~same', { sourceUpdatedAt: 100 }),
        docOf('char:1~gone', { sourceUpdatedAt: 100 }),
      ],
    });
    await syncSharedPlans(1, 'c1');
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0]![0]).toEqual({ path: 'communities/c1/skillPlans/char:1~edited' });
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc.mock.calls[0]![0]).toEqual({ path: 'communities/c1/skillPlans/char:1~gone' });
  });

  it('takes down the copy of a shared plan that can no longer be shared, and keeps going', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ skillTypeID: i + 1, targetLevel: 1 }));
    await db.skillPlans.bulkPut([
      { id: 'big', characterId: 1, name: 'B', entries: many, remapCount: 0, updatedAt: 200 },
      { id: 'edited', characterId: 1, name: 'E', entries: [], remapCount: 0, updatedAt: 200 },
    ]);
    getDocs.mockResolvedValue({
      docs: [
        docOf('char:1~big', { sourceUpdatedAt: 100 }),
        docOf('char:1~edited', { sourceUpdatedAt: 100 }),
      ],
    });
    deleteDoc.mockRejectedValueOnce(new Error('offline'));
    await syncSharedPlans(1, 'c1');
    expect(deleteDoc.mock.calls[0]![0]).toEqual({ path: 'communities/c1/skillPlans/char:1~big' });
    // The failed delete did not stop the next plan from being refreshed.
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0]![0]).toEqual({ path: 'communities/c1/skillPlans/char:1~edited' });
  });

  it('does nothing when the Character has shared no plan here', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await db.skillPlans.put({
      id: 'p',
      characterId: 1,
      name: 'P',
      entries: [],
      remapCount: 0,
      updatedAt: 1,
    });
    await syncSharedPlans(1, 'c1');
    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('never throws when Firestore does', async () => {
    getDocs.mockRejectedValue(new Error('offline'));
    await expect(syncSharedPlans(1, 'c1')).resolves.toBeUndefined();
  });
});
