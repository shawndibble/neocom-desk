/**
 * Test-only sync-status fixtures. Imported by test files only — nothing in the
 * app references this module (`esi/cacheFixtures.ts`'s shape, same reasoning).
 *
 * It exists because every test that renders a component reaching `Layout` now
 * has to mock `@/sync`'s `getSyncStatus`, which `app/backgroundSync.ts` calls
 * to skip a Character whose sync is already running. Nine such files would
 * otherwise each carry their own copy of the same literal.
 */
import type { SyncStatus } from './status';

/**
 * One frozen object, deliberately not a factory: a mock handing back a fresh
 * object per call breaks any consumer comparing status by identity.
 */
export const IDLE_SYNC_STATUS: SyncStatus = Object.freeze({
  state: 'idle',
  lastSyncedAt: null,
  error: null,
});
