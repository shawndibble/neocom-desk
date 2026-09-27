// purgeStaleAccounts: the pure decision logic behind the server-side purge of
// synced data for accounts that stopped syncing (issue #2065). The
// `onSchedule` wiring lives in index.ts, the same split purgeFeed.ts uses —
// this module never touches Firestore, so it's unit testable without an
// emulator.
//
// "Last synced" is a heartbeat, not the newest document `updatedAt`: every
// successful client sync stamps `lastSyncedAt` on the `characters/{uid}`
// parent doc (planSync.ts), so an account that syncs daily without editing
// anything is never mistaken for an idle one.
//
// Which collections to delete is not declared here: the function enumerates
// the account's subcollections at run time (`listCollections()`), so it always
// covers whatever the synced collection registry (src/sync/syncedCollections.ts,
// which functions/ cannot import) has written — there is no second list to drift.

/** Days of no successful sync after which an account's synced data is purged. */
export const ACCOUNT_INACTIVITY_DAYS = 90;

/** The inactivity window, in ms. Named and exported once. */
export const ACCOUNT_INACTIVITY_MS = ACCOUNT_INACTIVITY_DAYS * 24 * 3_600_000;

/** Firestore's hard cap on writes in a single `WriteBatch`. */
export const STALE_ACCOUNT_BATCH_SIZE = 500;

/**
 * Delete passes per run across all accounts, so one invocation can't spin
 * unboundedly on a backlog. A larger backlog continues on the next tick: the
 * parent doc (and so the stale heartbeat) is only removed once every
 * subcollection is empty.
 */
export const STALE_ACCOUNT_MAX_PASSES = 40;

/** The heartbeat field on `characters/{uid}`. */
export const LAST_SYNCED_FIELD = 'lastSyncedAt';

/** The `lastSyncedAt` an account must be strictly below to be stale. */
export function staleAccountCutoff(nowMs: number): number {
  return nowMs - ACCOUNT_INACTIVITY_MS;
}

/** Strictly more than 90 days since the last sync. */
export function isAccountStale(lastSyncedMs: number, nowMs: number): boolean {
  return lastSyncedMs < staleAccountCutoff(nowMs);
}

/** The heartbeat off a `characters/{uid}` doc's data, or undefined if unseeded. */
export function lastSyncedAtOf(data: Record<string, unknown> | undefined): number | undefined {
  const value = data?.[LAST_SYNCED_FIELD];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export type AccountAction = 'seed' | 'purge' | 'keep';

/**
 * An account with no heartbeat yet (data that predates it) is *seeded* with
 * `now` and only purged after a full window from then — never deleted on the
 * first run, whatever its documents' ages.
 */
export function decideAccountAction(
  lastSyncedMs: number | undefined,
  nowMs: number
): AccountAction {
  if (lastSyncedMs === undefined) return 'seed';
  return isAccountStale(lastSyncedMs, nowMs) ? 'purge' : 'keep';
}
