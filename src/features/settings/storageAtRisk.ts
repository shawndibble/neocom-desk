import { create } from 'zustand';
import { db } from '@/db';
import { isInstalledApp } from '@/lib/installedApp';
import { readPersisted, type PersistableStorage } from '@/lib/persistStorage';

export const useStorageAtRisk = create<{ atRisk: boolean }>(() => ({ atRisk: false }));

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

export function clearStorageAttention(): void {
  generation++;
  useStorageAtRisk.setState({ atRisk: false });
}
