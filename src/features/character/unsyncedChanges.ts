// Whether removing or logging out Characters could lose edits that never
// reached the synced copy (audit D1). The sync layer keeps no per-row "dirty"
// marker (rows merge last-write-wins on `updatedAt`, and the last-pushed state
// lives in Firestore), so there is no exact answer on the device. This is the
// conservative one: when sync is set up, offline, or a Character's last sync
// this session was not a clean success, the pilot is told it may.

import { getSyncStatus, type SyncStatus } from '@/sync/status';

export interface UnsyncedChangesInput {
  characterIds: readonly number[];
  /** `isSyncConfigured()`: without sync there is no synced copy to fall behind. */
  syncConfigured: boolean;
  /** `useOnline()` / `isOnline()`. */
  online: boolean;
  /** Swapped in tests. */
  statusOf?: (characterId: number) => SyncStatus;
}

const isCleanSuccess = (status: SyncStatus): boolean =>
  status.state === 'idle' && status.lastSyncedAt !== null;

export function mayHaveUnsyncedChanges({
  characterIds,
  syncConfigured,
  online,
  statusOf = getSyncStatus,
}: UnsyncedChangesInput): boolean {
  if (!syncConfigured) return false;
  if (!online) return true;
  return characterIds.some((id) => !isCleanSuccess(statusOf(id)));
}
