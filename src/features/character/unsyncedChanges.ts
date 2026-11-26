import { getSyncStatus, hasPendingSync, type SyncStatus } from '@/sync/status';

export interface UnsyncedChangesInput {
  characterIds: readonly number[];
  syncConfigured: boolean;
  online: boolean;
  statusOf?: (characterId: number) => SyncStatus;
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
