import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import type { SyncStatus } from '@/sync/status';
import { createSyncedSetting } from './useSyncedSetting';

// A real allow-listed key, because the factory rejects anything else — the
// allow-list is the whole point of the `sync.` namespace. Which preference it
// happens to belong to is irrelevant here.
const KEY = 'sync.marketHub';
const LEGACY_KEY = 'marketHub';

const setSyncedSetting = vi.fn<(key: string, value: unknown) => Promise<void>>();
const scheduleSync = vi.fn<(characterId: number) => void>();
let statusListeners: ((status: SyncStatus) => void)[] = [];

vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  // `MODE === 'test'` makes the real one false, which would switch off every
  // sync-side path this file exists to test.
  isSyncConfigured: () => true,
}));

// A factory mock with no `importOriginal`, deliberately: several suites mock
// the barrel exactly like this, and the factory under test must stay
// initializable under one — which is why its allow-list check imports the leaf
// module instead.
const IDLE_SYNC_STATUS = vi.hoisted(() =>
  Object.freeze({ state: 'idle', lastSyncedAt: null, error: null })
);
vi.mock('@/sync', () => ({
  getSyncStatus: () => IDLE_SYNC_STATUS,
  setSyncedSetting: (key: string, value: unknown) => setSyncedSetting(key, value),
  scheduleSync: (characterId: number) => scheduleSync(characterId),
}));

vi.mock('@/sync/status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync/status')>()),
  subscribeSyncStatus: (listener: (status: SyncStatus) => void) => {
    statusListeners.push(listener);
    listener({ state: 'idle', lastSyncedAt: null, error: null });
    return () => {
      statusListeners = statusListeners.filter((l) => l !== listener);
    };
  },
}));

/** A sync run that finished successfully, as `status.ts` reports one. */
function announceSyncedAt(lastSyncedAt: number): void {
  for (const listener of statusListeners) listener({ state: 'idle', lastSyncedAt, error: null });
}

/**
 * Settles every Dexie read already in flight. IndexedDB serves requests on a
 * store in order, so a read issued now cannot resolve before one issued
 * earlier — which is what makes the "a press outran the pull" assertion below
 * deterministic rather than a race against a timer.
 */
const settleReads = () => db.settings.get('sync.__probe');

beforeEach(async () => {
  await db.settings.clear();
  await db.characters.clear();
  statusListeners = [];
  setSyncedSetting.mockReset();
  setSyncedSetting.mockResolvedValue(undefined);
  scheduleSync.mockReset();
});

describe('createSyncedSetting', () => {
  it('rejects a key outside the sync namespace', () => {
    expect(() => createSyncedSetting({ key: 'marketHub', defaultValue: 'jita' })).toThrow(/sync\./);
  });

  it('rejects a sync key that is not on the allow-list', () => {
    expect(() => createSyncedSetting({ key: 'sync.notAThing', defaultValue: 'jita' })).toThrow(
      /allow-list/
    );
  });

  it('starts at the default and unhydrated, before Dexie is read', () => {
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    expect(useSetting.getState().value).toBe('jita');
    expect(useSetting.getState().hydrated).toBe(false);
  });

  it('hydrates from the synced key', async () => {
    await db.settings.put({ key: KEY, value: 'amarr' });
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('amarr');
    expect(useSetting.getState().hydrated).toBe(true);
  });

  it('hydrates to the default when neither key is stored', async () => {
    const useSetting = createSyncedSetting({
      key: KEY,
      legacyKey: LEGACY_KEY,
      defaultValue: 'jita',
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('jita');
    expect(useSetting.getState().hydrated).toBe(true);
  });

  it('adopts the device-local value this preference had before it synced', async () => {
    await db.settings.put({ key: LEGACY_KEY, value: 'dodixie' });
    const useSetting = createSyncedSetting({
      key: KEY,
      legacyKey: LEGACY_KEY,
      defaultValue: 'jita',
    });
    await useSetting.getState().hydrate();

    expect(useSetting.getState().value).toBe('dodixie');
    expect((await db.settings.get(KEY))?.value).toBe('dodixie');
  });

  it('seeds that adopted value as an unstamped row, so a remote copy outranks it', async () => {
    await db.settings.put({ key: LEGACY_KEY, value: 'dodixie' });
    const useSetting = createSyncedSetting({
      key: KEY,
      legacyKey: LEGACY_KEY,
      defaultValue: 'jita',
    });
    await useSetting.getState().hydrate();

    // setSyncedSetting stamps `updatedAt: Date.now()`, which would make a
    // never-synced local value beat every other device's real edit.
    expect(setSyncedSetting).not.toHaveBeenCalled();
  });

  it('leaves the legacy row alone, so an older bundle still reads its own value', async () => {
    await db.settings.put({ key: LEGACY_KEY, value: 'dodixie' });
    const useSetting = createSyncedSetting({
      key: KEY,
      legacyKey: LEGACY_KEY,
      defaultValue: 'jita',
    });
    await useSetting.getState().hydrate();

    expect((await db.settings.get(LEGACY_KEY))?.value).toBe('dodixie');
  });

  it('prefers the synced value over the legacy one once both exist', async () => {
    await db.settings.put({ key: LEGACY_KEY, value: 'dodixie' });
    await db.settings.put({ key: KEY, value: 'amarr' });
    const useSetting = createSyncedSetting({
      key: KEY,
      legacyKey: LEGACY_KEY,
      defaultValue: 'jita',
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('amarr');
  });

  it('falls back to the default when parse rejects the stored value', async () => {
    await db.settings.put({ key: KEY, value: 'not-a-hub' });
    const useSetting = createSyncedSetting({
      key: KEY,
      defaultValue: 'jita',
      parse: (raw) => (raw === 'jita' || raw === 'amarr' ? (raw as string) : null),
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('jita');
  });

  it('applies a set value before the write settles, and persists it', async () => {
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();

    const pending = useSetting.getState().setValue('amarr');
    expect(useSetting.getState().value).toBe('amarr');
    await pending;

    expect((await db.settings.get(KEY))?.value).toBe('amarr');
    expect(setSyncedSetting).toHaveBeenCalledWith(KEY, 'amarr');
  });

  it('schedules a sync for every Character on the device, not just the active one', async () => {
    await db.characters.bulkPut([
      { characterId: 1, name: 'A', ownerHash: 'h1', addedAt: 0 },
      { characterId: 2, name: 'B', ownerHash: 'h2', addedAt: 0 },
    ]);
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();
    await useSetting.getState().setValue('amarr');

    expect(scheduleSync.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
  });

  it('keeps the choice on disk when the sync write fails', async () => {
    setSyncedSetting.mockRejectedValue(new Error('chunk load failed'));
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();

    await expect(useSetting.getState().setValue('amarr')).resolves.toBeUndefined();
    expect(useSetting.getState().value).toBe('amarr');
    expect((await db.settings.get(KEY))?.value).toBe('amarr');
  });

  it('picks up a value another device wrote, once a sync has pulled it', async () => {
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('jita');

    // What planSync's settings pull does: a bare put, behind the store's back.
    await db.settings.put({ key: KEY, value: 'amarr' });
    announceSyncedAt(1000);

    await vi.waitFor(() => expect(useSetting.getState().value).toBe('amarr'));
  });

  it('runs a pulled value through parse rather than trusting the other device', async () => {
    await db.settings.put({ key: KEY, value: 'amarr' });
    const useSetting = createSyncedSetting({
      key: KEY,
      defaultValue: 'jita',
      parse: (raw) => (raw === 'jita' || raw === 'amarr' ? (raw as string) : null),
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe('amarr');

    // A hub id this build has never heard of — an older bundle's, or a row
    // edited by hand. It must land as the default, not as itself.
    await db.settings.put({ key: KEY, value: 'hub-from-a-newer-build' });
    announceSyncedAt(1000);

    await vi.waitFor(() => expect(useSetting.getState().value).toBe('jita'));
  });

  it('does not revert a press that landed while a pull was being read back', async () => {
    await db.settings.put({ key: KEY, value: 'amarr' });
    const useSetting = createSyncedSetting({ key: KEY, defaultValue: 'jita' });
    await useSetting.getState().hydrate();

    // The re-read is issued here; the press lands before it resolves, and is
    // the newer of the two.
    announceSyncedAt(1000);
    await useSetting.getState().setValue('dodixie');
    await settleReads();

    expect(useSetting.getState().value).toBe('dodixie');
  });
});
