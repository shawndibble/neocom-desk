// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  DATABASE_DELETE_TIMEOUT_MS,
  deleteAllLocalData,
  purgeAllRemoteCharacterData,
} from './deleteAllCharacterData';

const syncMock = vi.hoisted(() => ({
  clearCharacterSyncBookkeeping: vi.fn(async () => {}),
  purgeCharacterRemoteDataOrDefer: vi.fn<(characterId: number) => Promise<boolean>>(
    async () => true
  ),
  triggerSync: vi.fn(async () => {}),
  signOutOfSync: vi.fn(async () => {}),
  haltSync: vi.fn(async () => {}),
  REMOTE_PURGE_PENDING_PREFIX: 'remotePurgePending.',
}));
vi.mock('@/sync', () => syncMock);
const pushMock = vi.hoisted(() => ({
  scheduleProjectionRebuild: Object.assign(vi.fn(), { cancel: vi.fn() }),
  unregisterProjectionRegistration: vi.fn(async () => {}),
}));
vi.mock('@/features/notifications/projectionRebuildScheduler', () => ({
  scheduleProjectionRebuild: pushMock.scheduleProjectionRebuild,
}));
vi.mock('@/features/notifications/projectionUpload', () => ({
  unregisterProjectionRegistration: pushMock.unregisterProjectionRegistration,
}));

async function seedCharacter(characterId: number): Promise<void> {
  await db.characters.put({
    characterId,
    name: `Pilot ${characterId}`,
    ownerHash: `hash-${characterId}`,
    addedAt: 1,
  });
  await db.tokens.put({
    characterId,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 100_000,
    scopes: [],
  });
  await db.skillPlans.add({
    id: `plan-${characterId}`,
    characterId,
    name: 'Plan',
    entries: [],
    remapCount: 1,
    updatedAt: 1,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // `deleteAllLocalData` deletes the database and leaves it closed.
  if (!db.isOpen()) await db.open();
  syncMock.purgeCharacterRemoteDataOrDefer.mockImplementation(async () => true);
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.skillPlans.clear(),
    db.settings.clear(),
  ]);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('purgeAllRemoteCharacterData', () => {
  it('purges every character’s remote data one at a time, while its token is still here', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    let inFlight = 0;
    syncMock.purgeCharacterRemoteDataOrDefer.mockImplementation(async (id) => {
      // One Firebase session is shared, so the purges must not overlap.
      expect(++inFlight).toBe(1);
      expect(await db.tokens.get(id)).toBeDefined();
      await Promise.resolve();
      inFlight--;
      return true;
    });

    const deferred = await purgeAllRemoteCharacterData();

    expect(syncMock.purgeCharacterRemoteDataOrDefer.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(deferred).toEqual([]);
  });

  it('returns the characters whose purge could not run now, and deletes nothing locally', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    syncMock.purgeCharacterRemoteDataOrDefer.mockImplementation(async (id) => id !== 2);

    const deferred = await purgeAllRemoteCharacterData();

    expect(deferred).toEqual([2]);
    expect(await db.characters.count()).toBe(2);
    expect(await db.tokens.count()).toBe(2);
  });

  it('never pushes local edits, which would put the purged data back', async () => {
    await seedCharacter(1);

    await purgeAllRemoteCharacterData();

    expect(syncMock.triggerSync).not.toHaveBeenCalled();
  });

  it('halts syncing before the first purge, so none can push purged rows back', async () => {
    await seedCharacter(1);
    syncMock.purgeCharacterRemoteDataOrDefer.mockImplementation(async () => {
      expect(syncMock.haltSync).toHaveBeenCalled();
      return true;
    });

    await purgeAllRemoteCharacterData();

    expect(syncMock.purgeCharacterRemoteDataOrDefer).toHaveBeenCalledOnce();
  });
});

describe('deleteAllLocalData', () => {
  it('deletes every table’s rows from this device', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await db.settings.put({ key: 'theme', value: 'dark' });
    await db.settings.put({ key: 'sync.marketHub', value: 60003760 });

    await deleteAllLocalData(true);
    await db.open();

    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    expect(await db.skillPlans.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
  });

  it('keeps pending remote-purge markers, so a deferred purge still retries', async () => {
    await seedCharacter(1);
    await db.settings.put({ key: 'remotePurgePending.1', value: true });

    await deleteAllLocalData(true);
    await db.open();

    expect(await db.settings.toArray()).toEqual([{ key: 'remotePurgePending.1', value: true }]);
  });

  it('deletes the app’s other IndexedDB databases', async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('firebaseLocalStorageDb');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    await deleteAllLocalData(true);

    const names = (await indexedDB.databases()).map((info) => info.name);
    expect(names).not.toContain('firebaseLocalStorageDb');
  });

  it('clears web storage', async () => {
    localStorage.setItem('neocom.deviceId', 'device-1');
    sessionStorage.setItem('loginReturnTo', '/skills');

    await deleteAllLocalData(true);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('deletes runtime caches but keeps the precached app shell', async () => {
    const names = ['workbox-precache-v2-https://example.test/', 'dogma-engine-v3'];
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    try {
      await deleteAllLocalData(true);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(deleted).toEqual(['dogma-engine-v3']);
  });

  it('unregisters push and signs out before the stores go', async () => {
    await seedCharacter(1);
    const storesStillThere = async () => (await db.characters.count()) > 0;
    pushMock.unregisterProjectionRegistration.mockImplementationOnce(async () => {
      expect(await storesStillThere()).toBe(true);
    });
    const signedOutWithStores: boolean[] = [];
    syncMock.signOutOfSync.mockImplementationOnce(async () => {
      signedOutWithStores.push(await storesStillThere());
    });

    await deleteAllLocalData(true);

    expect(pushMock.scheduleProjectionRebuild.cancel).toHaveBeenCalled();
    expect(pushMock.unregisterProjectionRegistration).toHaveBeenCalledOnce();
    expect(signedOutWithStores).toEqual([true]);
  });

  it('never pushes and never purges again; the remote side is purgeAllRemoteCharacterData’s job', async () => {
    await seedCharacter(1);

    await deleteAllLocalData(true);

    expect(syncMock.triggerSync).not.toHaveBeenCalled();
    expect(syncMock.purgeCharacterRemoteDataOrDefer).not.toHaveBeenCalled();
  });

  it('halts syncing before signing out, so no debounce re-mints a session', async () => {
    await seedCharacter(1);
    const order: string[] = [];
    syncMock.haltSync.mockImplementationOnce(async () => {
      order.push('halt');
    });
    syncMock.signOutOfSync.mockImplementationOnce(async () => {
      order.push('signOut');
    });

    await deleteAllLocalData(true);

    expect(order).toEqual(['halt', 'signOut']);
  });

  it('fails, with every login already gone, when the database delete never finishes', async () => {
    await seedCharacter(1);
    const remove = vi.spyOn(db, 'delete').mockReturnValue(new Promise(() => {}) as never);
    // Only the timeout is faked: fake-indexeddb schedules on the other timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let settled = false;
      const done = deleteAllLocalData(true).finally(() => {
        settled = true;
      });
      const failed = expect(done).rejects.toThrow(/blocked/);
      // The steps before the delete are real IndexedDB work; keep advancing
      // until the delete's own timeout has been armed and has fired.
      while (!settled) await vi.advanceTimersByTimeAsync(DATABASE_DELETE_TIMEOUT_MS);
      await failed;
    } finally {
      vi.useRealTimers();
      remove.mockRestore();
    }

    expect(await db.tokens.count()).toBe(0);
  });

  it('skips the Firebase sign-out when sync is not configured', async () => {
    await seedCharacter(1);

    await deleteAllLocalData(false);

    expect(syncMock.signOutOfSync).not.toHaveBeenCalled();
    expect(syncMock.haltSync).not.toHaveBeenCalled();
  });
});
