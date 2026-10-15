// Whether removing or logging out Characters could lose edits that never
// reached the synced copy (audit D1). The sync layer keeps no per-row "dirty"
// marker (rows merge last-write-wins on `updatedAt`, and the last-pushed state
// lives in Firestore), so there is no exact answer on the device. What it does
// know: an edit waiting out its debounce (`hasPendingSync`), a sync running or
// failed, and whether the Character has synced at all this session. With sync
// set up, any of those, or being offline, means the pilot is told it may.

import { getSyncStatus, hasPendingSync, type SyncStatus } from '@/sync/status';

export interface UnsyncedChangesInput {
  characterIds: readonly number[];
  /** `isSyncConfigured()`: without sync there is no synced copy to fall behind. */
  syncConfigured: boolean;
  /** `useOnline()` / `isOnline()`. */
  online: boolean;
  /** Swapped in tests. */
  statusOf?: (characterId: number) => SyncStatus;
  /** Swapped in tests. */
  pendingOf?: (characterId: number) => boolean;
}

const isCleanSuccess = (status: SyncStatus): boolean =>
  status.state === 'idle' && status.lastSyncedAt !== null;

export function mayHaveUnsyncedChanges({
  characterIds,
  syncConfigured,
  online,
  statusOf = getSyncStatus,
  pendingOf = hasPendingSync,
}: UnsyncedChangesInput): boolean {
  if (!syncConfigured) return false;
  if (!online) return true;
  return characterIds.some((id) => pendingOf(id) || !isCleanSuccess(statusOf(id)));
}
