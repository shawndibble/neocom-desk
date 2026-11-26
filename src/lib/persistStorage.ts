import { db } from '@/db';
import { isInstalledApp } from './installedApp';

export const PERSIST_ASKED_KEY = 'storagePersistAsked';
export const PERSIST_ASKED_INSTALLED_KEY = 'storagePersistAskedInstalled';

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

export async function requestPersistenceOnce(
  storage: PersistableStorage | undefined = currentStorage(),
  askedKey: string = PERSIST_ASKED_KEY
): Promise<PersistResult> {
  if (!storage) return 'unsupported';
  try {
    const alreadyAsked = await db.transaction('rw', db.settings, async () => {
      if ((await db.settings.get(askedKey))?.value === true) return true;
      await db.settings.put({ key: askedKey, value: true });
      return false;
    });
    if (alreadyAsked) return 'skipped';
  } catch {
    return 'skipped';
  }
  return requestPersistence(storage);
}

export async function requestPersistenceWhenInstalled(
  installed: boolean = isInstalledApp(),
  storage: PersistableStorage | undefined = currentStorage()
): Promise<PersistResult> {
  if (!installed) return 'skipped';
  const persisted = await readPersisted(storage);
  if (persisted === null) return 'unsupported';
  if (persisted) return 'skipped';
  try {
    if ((await db.characters.count()) === 0) return 'skipped';
  } catch {
    return 'skipped';
  }
  return requestPersistenceOnce(storage, PERSIST_ASKED_INSTALLED_KEY);
}
