// Sync status store, tracked per character so character B's later result cannot
// stomp character A's error. Deliberately free of any Firebase import: index.ts
// re-exports it synchronously, so the nav dot can subscribe without pulling the
// sync driver (planSync.ts) into the entry chunk. Only planSync.ts writes here.

export type SyncState = 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  /**
   * Epoch ms of the last successful pass this session, or null — any pass,
   * including one narrowed to the collections an edit touched.
   */
  lastSyncedAt: number | null;
  /**
   * Epoch ms of the last successful *full* pass this session (every collection
   * pulled), or absent before one. What "how fresh is everything from other
   * devices" reads — the background sweep's gate (`app/backgroundSync.ts`) —
   * since a narrowed pass pulls only what the edit touched (issue #4896).
   */
  lastFullSyncAt?: number;
  error: string | null;
  /**
   * The failure in `error` was recorded while the browser was offline, so it
   * says nothing about the sync itself: the UI shows it as offline, not as an
   * error (`app/syncStatus.ts`). Only meaningful with `state: 'error'`.
   */
  offline?: boolean;
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

// Characters with an edit scheduled (`scheduleSync`'s debounce) but not yet
// handed to a sync. Kept here, not in planSync.ts, so the UI can read it
// without pulling the Firebase chunk in. A sync that has started shows as
// `state: 'syncing'` in the status above, so the two cover edit-to-push.
const scheduled = new Set<number>();

/** Only planSync.ts writes: an edit is waiting out its debounce, or it is not. */
export function setSyncScheduled(characterId: number, isScheduled: boolean): void {
  if (scheduled.has(characterId) === isScheduled) return;
  if (isScheduled) scheduled.add(characterId);
  else scheduled.delete(characterId);
  for (const listener of listeners) listener(latestStatus);
}

/** Clear every scheduled mark (the debounces were dropped). */
export function clearSyncScheduled(): void {
  if (scheduled.size === 0) return;
  scheduled.clear();
  for (const listener of listeners) listener(latestStatus);
}

/** An edit for this Character is scheduled but has not started syncing yet. */
export function hasPendingSync(characterId: number): boolean {
  return scheduled.has(characterId);
}
