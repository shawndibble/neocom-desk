// "Delete all data" (Settings → This device): every Character's synced
// Editable Data (Skill Plans, Build Plans, synced settings...) leaves
// Firestore now — the only client-side remote delete; otherwise it waits for
// the 90-day inactivity purge — and then everything this app keeps on the
// device goes too: IndexedDB, web storage, runtime caches. The caller
// reloads afterwards, so no in-memory state outlives the wipe.
//
// Two steps, so the caller can show a failed purge before the roster is gone.
// Neither pushes. A last push before a purge is wasted, and one after it
// would put the purged data straight back.

import { db } from '@/db';
import { haltSync, purgeCharacterRemoteData, signOutOfSync } from '@/sync';
import { setAppBadgeCount } from '@/features/notifications/badge';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';

/**
 * How long one database delete may wait on another tab's open connection.
 * Other tabs close and reload on the delete (app/databaseWipe.ts), so this only
 * bites a tab too stale to answer — the pilot must not be left staring at a
 * spinner over it. Another app's database is left behind; ours is a failure.
 */
export const DATABASE_DELETE_TIMEOUT_MS = 5_000;

/**
 * The app shell Workbox precaches. Kept: a wipe run offline (the likely case
 * when a purge failed) would otherwise reload into a blank page. It is code,
 * not data.
 */
const PRECACHE_PREFIX = 'workbox-precache';

/**
 * Step one: purge every Character's remote data. Syncing halts first, for the
 * rest of the page's life: a sync could push purged rows back, or switch the
 * shared Firebase session mid-purge. Sequential for that same session.
 *
 * A purge that can't run now (dead refresh token, offline) is not retried:
 * that Character's synced copy waits for the 90-day inactivity purge.
 *
 * @returns The Characters whose purge failed.
 */
export async function purgeAllRemoteCharacterData(): Promise<number[]> {
  await haltSync();
  const characters = await db.characters.orderBy('characterId').toArray();
  const unpurged: number[] = [];
  for (const { characterId } of characters) {
    try {
      await purgeCharacterRemoteData(characterId);
    } catch {
      unpurged.push(characterId);
    }
  }
  return unpurged;
}

/** True when `work` settled in time; false when the timeout won. */
function withTimeout(work: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), DATABASE_DELETE_TIMEOUT_MS);
  });
  return Promise.race([work.then(() => true), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Settles on success, error or `blocked`. Firebase keeps its own databases
 * open in this page, so theirs may be blocked; signing out first means
 * nothing left in them is a login.
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function deleteOtherDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
  const databases = await indexedDB.databases().catch(() => []);
  await Promise.all(
    databases
      .map((info) => info.name)
      .filter((name): name is string => !!name && name !== db.name)
      .map((name) => withTimeout(deleteDatabase(name)))
  );
}

function clearWebStorage(): void {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().clear();
    } catch {
      // Blocked storage has nothing of ours in it.
    }
  }
}

async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys().catch(() => []);
  await Promise.all(
    names
      .filter((name) => !name.startsWith(PRECACHE_PREFIX))
      .map((name) => caches.delete(name).catch(() => false))
  );
}

/**
 * Step two: everything this app stores on the device. Refresh tokens go
 * first; then what needs local state to undo — the push registration (keyed
 * by the device id in localStorage), the Firebase session, the app badge;
 * then every other store, the app's own database last.
 *
 * Deletes rows wholesale, not Character by Character, so the roster never
 * drops to zero mid-wipe and sends the app to /login before it is done. The
 * caller reloads straight after.
 *
 * @param syncConfigured Whether sync is set up here — gate on
 *   `isSyncConfigured()`, as `logoutAllCharacters` does.
 * @throws When the database delete does not finish in time. The logins are
 *   gone by then; the rest may not be.
 */
export async function deleteAllLocalData(syncConfigured: boolean): Promise<void> {
  // First, so no later step failing can leave a login on this device.
  await db.tokens.clear();

  scheduleProjectionRebuild.cancel();
  await unregisterProjectionRegistration();
  if (syncConfigured) {
    await haltSync();
    await signOutOfSync().catch(() => {
      // Its persisted session is deleted below with the rest of IndexedDB.
    });
  }
  await Promise.all([setAppBadgeCount(0), deleteOtherDatabases(), clearRuntimeCaches()]);
  clearWebStorage();

  if (!(await withTimeout(db.delete()))) {
    throw new Error('The app database delete is blocked by another tab');
  }
  // Empty and fresh: mounted live queries read nothing rather than throw on a
  // closed database until the caller's reload.
  await db.open();
}
