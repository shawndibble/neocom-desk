/**
 * Whether the app should attempt Firebase sync at all.
 *
 * Two conditions must hold:
 * - Firebase web config is present (`VITE_FIREBASE_API_KEY` set) — src/sync
 *   otherwise silently fails every call (invalid Firebase config), which is
 *   harmless but pointless network traffic and a dot with nothing to show.
 * - We are not running under the test runner (`MODE === 'test'`). This repo's
 *   `.env` carries a real (dev) Firebase project config, so env-presence
 *   alone doesn't distinguish "real app" from "vitest run" — without this
 *   check every test that mounts <App/> or <Layout/> would fire real
 *   network calls at the live project. Vite/Vitest set `import.meta.env.MODE`
 *   to `'test'` for all test runs; production/dev builds never see that value.
 *
 * `env` is injectable (mirrors src/esi/client's configureEsi pattern) so
 * tests can exercise both outcomes without stubbing global env state.
 */
import type { SyncStatus } from '@/sync';

export interface SyncEnv {
  MODE?: string;
  VITE_FIREBASE_API_KEY?: string;
}

export function isSyncConfigured(env: SyncEnv = import.meta.env): boolean {
  return env.MODE !== 'test' && Boolean(env.VITE_FIREBASE_API_KEY);
}

export type SyncDisplayState = 'idle' | 'syncing' | 'error' | 'offline';

/** Browser offline always wins: a queued sync can't run regardless of its last known state. */
export function syncDisplayState(status: SyncStatus, online: boolean): SyncDisplayState {
  if (!online) return 'offline';
  return status.state;
}
