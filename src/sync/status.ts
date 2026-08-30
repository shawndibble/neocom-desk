// Sync status store — tracked per character so character B's later result
// cannot stomp character A's error. subscribeSyncStatus streams every change
// (the UI dot shows the most recent one); getSyncStatus(characterId) reads a
// specific character's last known status.
//
// Deliberately free of any Firebase import: this module is re-exported
// synchronously from index.ts, so the nav dot can subscribe without pulling
// the Firebase-backed sync driver (planSync.ts) into the entry chunk. Only
// planSync.ts writes to it, via setStatus.

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Epoch ms of the last successful sync this session, or null. */
  lastSyncedAt: number | null;
  error: string | null;
  /** Character this status refers to; absent only before the first sync. */
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

/** Subscribe to sync status; the listener is called immediately with the current value. */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  listener(latestStatus);
  return () => listeners.delete(listener);
}

/** Last known status for one character (idle if it has never synced). */
export function getSyncStatus(characterId: number): SyncStatus {
  return statusByCharacter.get(characterId) ?? { ...IDLE_STATUS, characterId };
}
