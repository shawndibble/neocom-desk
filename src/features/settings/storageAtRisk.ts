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

// Settings' mount check can start while the boot ask is still in flight, and
// finish after it: only the newest check, or a later clear, may write.
let generation = 0;

export async function checkStorageAtRisk(
  installed: boolean = isInstalledApp(),
  storage?: PersistableStorage
): Promise<void> {
  const mine = ++generation;
  const persisted = installed ? await readPersisted(storage) : null;
  const atRisk = persisted === false && (await db.characters.count().catch(() => 0)) > 0;
  if (mine === generation) useStorageAtRisk.setState({ atRisk });
}

/**
 * The pilot has pressed Protect, or storage reads protected: handled either
 * way. A decline leaves nothing more to press, so the dot must not stay lit.
 */
export function clearStorageAttention(): void {
  generation++;
  useStorageAtRisk.setState({ atRisk: false });
}
