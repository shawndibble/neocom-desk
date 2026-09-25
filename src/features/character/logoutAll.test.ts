import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { logoutAllCharacters, SYNC_FLUSH_TIMEOUT_MS } from './logoutAll';

const syncMock = vi.hoisted(() => ({
  clearCharacterSyncBookkeeping: vi.fn(async () => {}),
  purgeCharacterRemoteDataOrDefer: vi.fn(async () => true),
  triggerSync: vi.fn<(characterId: number) => Promise<void>>(async () => {}),
  signOutOfSync: vi.fn(async () => {}),
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
  await db.esiCache.put({ characterId, key: 'wallet', value: 100, fetchedAt: 1 });
}

beforeEach(async () => {
  vi.clearAllMocks();
  syncMock.triggerSync.mockImplementation(async () => {});
  syncMock.signOutOfSync.mockImplementation(async () => {});
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.skillPlans.clear(),
    db.esiCache.clear(),
    db.settings.clear(),
  ]);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('logoutAllCharacters', () => {
  it('unregisters this device’s push once, and schedules no rebuild, for the whole roster', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await logoutAllCharacters(false);
    expect(pushMock.scheduleProjectionRebuild.cancel).toHaveBeenCalled();
    expect(pushMock.unregisterProjectionRegistration).toHaveBeenCalledTimes(1);
    expect(pushMock.scheduleProjectionRebuild).not.toHaveBeenCalled();
  });

  it('removes every character, token and per-character row from this device', async () => {
    await seedCharacter(1);
    await seedCharacter(2);
    await db.tokens.put({
      characterId: 3,
      accessToken: 'a',
      refreshToken: 'orphan',
      expiresAt: 1,
      scopes: [],
    });

    const count = await logoutAllCharacters(false);

    expect(count).toBe(2);
    expect(await db.characters.count()).toBe(0);
    expect(await db.tokens.count()).toBe(0);
    expect(await db.skillPlans.count()).toBe(0);
    expect(await db.esiCache.where('characterId').anyOf(1, 2).count()).toBe(0);
  });

  it('never touches remote data, and keeps device settings such as the synced preferences', async () => {
    await seedCharacter(1);
    await db.settings.put({ key: 'marketHub', value: 'amarr' });
    await db.settings.put({ key: 'sync.assumedMe', value: 10 });

    await logoutAllCharacters(true);

    expect(syncMock.purgeCharacterRemoteDataOrDefer).not.toHaveBeenCalled();
    expect((await db.settings.get('marketHub'))?.value).toBe('amarr');
    expect((await db.settings.get('sync.assumedMe'))?.value).toBe(10);
  });

  it('clears the active character', async () => {
    await seedCharacter(1);
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });

    await logoutAllCharacters(false);

    expect(useActiveCharacter.getState().activeCharacterId).toBeNull();
  });

  it('pushes pending edits for each character first when sync is configured', async () => {
    await seedCharacter(1);
    await seedCharacter(2);

    await logoutAllCharacters(true);

    expect(syncMock.triggerSync.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
  });

  it('skips the push and the Firebase sign-out when sync is not configured', async () => {
    await seedCharacter(1);

    await logoutAllCharacters(false);

    expect(syncMock.triggerSync).not.toHaveBeenCalled();
    expect(syncMock.signOutOfSync).not.toHaveBeenCalled();
  });

  it('signs out of the Firebase session after the local data is gone, and survives that failing', async () => {
    await seedCharacter(1);
    syncMock.signOutOfSync.mockImplementationOnce(async () => {
      expect(await db.characters.count()).toBe(0);
      throw new Error('offline');
    });

    await logoutAllCharacters(true);

    expect(syncMock.signOutOfSync).toHaveBeenCalledOnce();
    expect(await db.tokens.count()).toBe(0);
  });

  it('still logs out when the push fails', async () => {
    await seedCharacter(1);
    syncMock.triggerSync.mockRejectedValueOnce(new Error('offline'));

    await logoutAllCharacters(true);

    expect(await db.characters.count()).toBe(0);
  });

  it('still logs out when the push never settles', async () => {
    await seedCharacter(1);
    // Only the timeout is faked: fake-indexeddb schedules on the other timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      syncMock.triggerSync.mockImplementationOnce(() => new Promise<void>(() => {}));

      const done = logoutAllCharacters(true);
      // One budget for all pushes, not one per Character.
      await vi.advanceTimersByTimeAsync(SYNC_FLUSH_TIMEOUT_MS + 1);
      await done;

      expect(await db.characters.count()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
