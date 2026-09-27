// "Delete all character data" (Settings → This device): every Character's
// synced Editable Data (Skill Plans, Build Plans, synced settings...) leaves
// Firestore, the way removing one Character does (removeCharacter.ts), and
// then everything this app keeps in the browser goes too — IndexedDB, web
// storage, runtime caches. The caller reloads afterwards, so no in-memory
// state outlives the wipe.
//
// Two steps, so the caller can show the outcome before it is gone. Step one
// purges while every token is still here — purging needs a live Firebase
// session per Character. Step two is the local wipe.
//
// Neither step pushes. A last push before a purge is wasted, and one after it
// would put the purged data straight back.

import { db } from '@/db';
import {
  purgeCharacterRemoteDataOrDefer,
  REMOTE_PURGE_PENDING_PREFIX,
  signOutOfSync,
} from '@/sync';
import { setAppBadgeCount } from '@/features/notifications/badge';
import { scheduleProjectionRebuild } from '@/features/notifications/projectionRebuildScheduler';
import { unregisterProjectionRegistration } from '@/features/notifications/projectionUpload';

/**
 * How long one database delete may wait on another tab's open connection
 * before the wipe goes on without it. Dexie closes on `versionchange`, so this
 * only bites a tab too stale to answer — the pilot must not be left staring at
 * a spinner over it.
 */
export const DATABASE_DELETE_TIMEOUT_MS = 5_000;

/**
 * The app shell Workbox precaches. Kept: a wipe run offline (the likely case
 * when a purge was deferred) would otherwise reload into a blank page. It is
 * code, not data.
 */
const PRECACHE_PREFIX = 'workbox-precache';

/**
 * Step one: purge every Character's remote data. Sequential, because
 * `ensureSignedIn` holds one shared Firebase session and signs in as each
 * Character in turn.
 *
 * A purge that can't run now (dead refresh token, offline) is recorded as
 * pending on this device and retried the next time that Character logs in
 * here — see sync/characterPurge.ts. Step two carries those markers across.
 *
 * @returns The Characters whose purge was deferred rather than done.
 */
export async function purgeAllRemoteCharacterData(): Promise<number[]> {
  const characters = await db.characters.orderBy('characterId').toArray();
  const deferred: number[] = [];
  for (const { characterId } of characters) {
    if (!(await purgeCharacterRemoteDataOrDefer(characterId))) deferred.push(characterId);
  }
  return deferred;
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
 * Step two: everything this app stores in the browser. What needs local state
 * to undo runs first — the push registration (keyed by the device id in
 * localStorage), the Firebase session, the app badge — then the stores go,
 * the app's own database last.
 *
 * Pending-purge markers from step one are written back into a fresh database,
 * so a deferred purge still retries when that Character logs in here again.
 *
 * Deletes rows wholesale, not Character by Character, so the roster never
 * drops to zero mid-wipe and sends the app to /login before it is done. The
 * caller reloads straight after: Dexie stays closed until then.
 *
 * @param syncConfigured Whether sync is set up here — gate on
 *   `isSyncConfigured()`, as `logoutAllCharacters` does.
 */
export async function deleteAllLocalData(syncConfigured: boolean): Promise<void> {
  const pendingPurges = await db.settings
    .where('key')
    .startsWith(REMOTE_PURGE_PENDING_PREFIX)
    .toArray();

  scheduleProjectionRebuild.cancel();
  await unregisterProjectionRegistration();
  if (syncConfigured) {
    await signOutOfSync().catch(() => {
      // Its persisted session is deleted below with the rest of IndexedDB.
    });
  }
  await setAppBadgeCount(0);
  await deleteOtherDatabases();
  await clearRuntimeCaches();
  clearWebStorage();

  // Last: once it is gone every mounted live query fails, so the caller's
  // reload should follow at once.
  const deleted = await withTimeout(db.delete());
  // A delete still waiting on another tab would hold the reopen behind it.
  if (deleted && pendingPurges.length > 0) {
    await db.open();
    await db.settings.bulkPut(pendingPurges);
    db.close();
  }
}
