import type { SyncStatus } from '@/sync';

export interface SyncEnv {
  MODE?: string;
  VITE_FIREBASE_API_KEY?: string;
}

export function isSyncConfigured(env: SyncEnv = import.meta.env): boolean {
  return env.MODE !== 'test' && Boolean(env.VITE_FIREBASE_API_KEY);
}

export type SyncDisplayState = 'idle' | 'syncing' | 'error' | 'offline';

export function syncDisplayState(status: SyncStatus, online: boolean): SyncDisplayState {
  if (!online) return 'offline';
  if (status.state === 'error' && status.offline === true) return 'offline';
  return status.state;
}
