import { create } from 'zustand';
import { db } from '@/db';
import { isInstalledApp } from '@/lib/installedApp';
import { readPersisted, type PersistableStorage } from '@/lib/persistStorage';

/**
 * Whether Settings › Offline data needs attention: the app runs installed,
 * where the browser grants persistence, has Characters to lose, and storage is
 * still not protected. A browser tab is never flagged: there the browser
 * usually declines, and the dot would not clear.
 */
export const useStorageAtRisk = create<{ atRisk: boolean }>(() => ({ atRisk: false }));

export async function checkStorageAtRisk(
  installed: boolean = isInstalledApp(),
  storage?: PersistableStorage
): Promise<void> {
  const persisted = installed ? await readPersisted(storage) : null;
  const atRisk = persisted === false && (await db.characters.count().catch(() => 0)) > 0;
  useStorageAtRisk.setState({ atRisk });
}

/**
 * The pilot has pressed Protect, or storage reads protected: handled either
 * way. A decline leaves nothing more to press, so the dot must not stay lit.
 */
export function clearStorageAttention(): void {
  useStorageAtRisk.setState({ atRisk: false });
}
