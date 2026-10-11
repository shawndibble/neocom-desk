/**
 * When it is safe to treat "no stored Overview Layout" as a first run.
 *
 * A second device has no layout row until its first sync pull lands. A choice
 * made (or a migration written) before then is stamped "now" and, merged
 * last-write-wins, would overwrite the layout the pilot built on the first
 * device. So the Role chooser, and the migration's write, wait for the first
 * pull. They must not wait forever: a device that cannot sync (offline, a
 * failing pull, a wait that ran out) is treated as settled, because blocking a
 * pilot who is offline is worse than the rare overwrite.
 *
 * `createSyncedSetting` has no unstamped write, so waiting is the guard. A seed
 * written unstamped would read as `updatedAt: 0` and lose to any remote copy,
 * which is what we want, but that needs a store option the setting API does not
 * have; adding one is out of this stage's scope.
 */
import type { SyncState } from '@/sync/status';

export interface SyncSettledInput {
  syncConfigured: boolean;
  state: SyncState;
  lastSyncedAt: number | null;
  online: boolean;
  waitedOut: boolean;
}

/** How long a first run waits for the first pull before it gives up and asks. */
export const FIRST_PULL_WAIT_MS = 6000;

export function syncSettled(input: SyncSettledInput): boolean {
  if (!input.syncConfigured) return true;
  if (input.lastSyncedAt !== null && input.state === 'idle') return true;
  return input.state === 'error' || !input.online || input.waitedOut;
}
