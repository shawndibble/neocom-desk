/**
 * Persistent storage (`navigator.storage.persist()`): without it the browser
 * may evict this origin's data (the downloaded SDE files, the Dexie database)
 * under storage pressure, which would take the offline copy with it.
 *
 * Asked once automatically when a device first gets Characters, by signing in
 * (`features/character/addCharacter.ts`) or by importing a backup
 * (`backup/io.ts`), and never again on its own — a browser that prompts
 * (Firefox) must not be nagged. A device set up by import never signs in
 * "first", so before the import ask it was never protected at all, and an
 * Android phone lost every Character to eviction.
 *
 * One more automatic ask, under its own flag, on the first installed launch:
 * Chrome declines a plain tab but grants an installed app without a prompt,
 * so a decline from before the install says nothing about now. The Offline
 * data panel's button asks on demand.
 */
import { db } from '@/db';

export const PERSIST_ASKED_KEY = 'storagePersistAsked';
export const PERSIST_ASKED_INSTALLED_KEY = 'storagePersistAskedInstalled';

/** The slice of `StorageManager` this uses; `undefined` where the API is missing. */
export interface PersistableStorage {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

export type PersistResult = 'granted' | 'denied' | 'unsupported' | 'skipped';

function currentStorage(): PersistableStorage | undefined {
  const manager = typeof navigator === 'undefined' ? undefined : navigator.storage;
  return manager && typeof manager.persist === 'function' && typeof manager.persisted === 'function'
    ? manager
    : undefined;
}

/** Whether storage is persisted now; `null` where the browser cannot say. */
export async function readPersisted(
  storage: PersistableStorage | undefined = currentStorage()
): Promise<boolean | null> {
  if (!storage) return null;
  try {
    return await storage.persisted();
  } catch {
    return null;
  }
}

/** Asks the browser to persist storage, now. Never throws. */
export async function requestPersistence(
  storage: PersistableStorage | undefined = currentStorage()
): Promise<Exclude<PersistResult, 'skipped'>> {
  if (!storage) return 'unsupported';
  try {
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * The automatic ask: idempotent, and records in Dexie that it asked *before*
 * asking, so a crash or a hung prompt cannot lead to a second one.
 */
export async function requestPersistenceOnce(
  storage: PersistableStorage | undefined = currentStorage(),
  askedKey: string = PERSIST_ASKED_KEY
): Promise<PersistResult> {
  if (!storage) return 'unsupported';
  try {
    // One transaction, so two callers (two tabs) cannot both see "not asked yet".
    const alreadyAsked = await db.transaction('rw', db.settings, async () => {
      if ((await db.settings.get(askedKey))?.value === true) return true;
      await db.settings.put({ key: askedKey, value: true });
      return false;
    });
    if (alreadyAsked) return 'skipped';
  } catch {
    // Dexie unavailable: asking again later is not worth a prompt loop.
    return 'skipped';
  }
  return requestPersistence(storage);
}

/** Whether this page runs as the installed app (standalone display; iOS's flag). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * The installed-launch ask (see the module comment). Only with Characters on
 * the device — before that, the sign-in or import ask covers it — and only
 * while storage is not yet persisted, so a protected device records nothing.
 */
export async function requestPersistenceWhenInstalled(
  installed: boolean = isInstalledApp(),
  storage: PersistableStorage | undefined = currentStorage()
): Promise<PersistResult> {
  if (!installed) return 'skipped';
  const persisted = await readPersisted(storage);
  if (persisted === null) return 'unsupported';
  if (persisted) return 'granted';
  try {
    if ((await db.characters.count()) === 0) return 'skipped';
  } catch {
    return 'skipped';
  }
  return requestPersistenceOnce(storage, PERSIST_ASKED_INSTALLED_KEY);
}
