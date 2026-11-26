export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  lastFullSyncAt?: number;
  error: string | null;
  offline?: boolean;
  characterId?: number;
}

const IDLE_STATUS: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };
let latestStatus: SyncStatus = IDLE_STATUS;
const statusByCharacter = new Map<number, SyncStatus>();
const listeners = new Set<(status: SyncStatus) => void>();

export function setStatus(characterId: number, patch: Partial<SyncStatus>): void {
  const base = statusByCharacter.get(characterId) ?? { ...IDLE_STATUS, characterId };
  const next = { ...base, ...patch, characterId };
  statusByCharacter.set(characterId, next);
  latestStatus = next;
  for (const listener of listeners) listener(next);
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(latestStatus);
  return () => listeners.delete(listener);
}

export function getSyncStatus(characterId: number): SyncStatus {
  return statusByCharacter.get(characterId) ?? { ...IDLE_STATUS, characterId };
}

const scheduled = new Set<number>();

export function setSyncScheduled(characterId: number, isScheduled: boolean): void {
  if (scheduled.has(characterId) === isScheduled) return;
  if (isScheduled) scheduled.add(characterId);
  else scheduled.delete(characterId);
  for (const listener of listeners) listener(latestStatus);
}

export function clearSyncScheduled(): void {
  if (scheduled.size === 0) return;
  scheduled.clear();
  for (const listener of listeners) listener(latestStatus);
}

export function hasPendingSync(characterId: number): boolean {
  return scheduled.has(characterId);
}
