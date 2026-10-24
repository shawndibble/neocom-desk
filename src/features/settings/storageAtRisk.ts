import { create } from 'zustand';
import { isInstalledApp, readPersisted, type PersistableStorage } from '@/lib/persistStorage';

/**
 * Whether Settings › Offline data needs attention: the app runs installed,
 * where the browser grants persistence, and storage is still not protected —
 * so one press keeps the Characters from being evicted. A browser tab is never
 * flagged: there the browser usually declines, and the dot would not clear.
 */
export const useStorageAtRisk = create<{ atRisk: boolean }>(() => ({ atRisk: false }));

export async function checkStorageAtRisk(
  installed: boolean = isInstalledApp(),
  storage?: PersistableStorage
): Promise<void> {
  const persisted = installed ? await readPersisted(storage) : null;
  useStorageAtRisk.setState({ atRisk: persisted === false });
}

/** Storage is protected now (the Offline data panel read or granted it). */
export function markStorageProtected(): void {
  useStorageAtRisk.setState({ atRisk: false });
}
