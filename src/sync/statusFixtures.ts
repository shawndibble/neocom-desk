import type { SyncStatus } from './status';

export const IDLE_SYNC_STATUS: SyncStatus = Object.freeze({
  state: 'idle',
  lastSyncedAt: null,
  error: null,
});
