import type { SyncState } from '@/sync/status';

export interface SyncSettledInput {
  syncConfigured: boolean;
  state: SyncState;
  lastSyncedAt: number | null;
  online: boolean;
  waitedOut: boolean;
}

export const FIRST_PULL_WAIT_MS = 6000;

export function syncSettled(input: SyncSettledInput): boolean {
  if (!input.syncConfigured) return true;
  if (input.lastSyncedAt !== null && input.state === 'idle') return true;
  return input.state === 'error' || !input.online || input.waitedOut;
}
