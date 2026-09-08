// purgeFeed: the pure decision logic behind the server-side Notification Feed
// expiry (issue #595). The `onSchedule` wiring lives in index.ts, the same
// split dispatchProjections.ts uses — this module never touches Firestore, so
// it's unit testable without an emulator.
//
// Why this exists at all, given #582 already bounds the collection from the
// client: that rule runs during `syncFeed`, so it only reaches an account
// something still signs in as. Uninstall every device without removing the
// Characters and nothing ever runs `syncFeed` against that uid again, leaving
// `characters/{uid}/notificationFeed` frozen at whatever it held. This is the
// belt-and-braces half that reaches those rows; `mergeFeed`'s own
// `purgeRemote` is not weakened by it and is still what stops the pull churn
// #582 was actually about.

import { FIRED_RETENTION_MS } from './dispatchProjections.js';

/**
 * The collection name under `characters/{uid}`. Queried as a *collection
 * group*, which is what lets one query reach every account's subcollection
 * without enumerating uids — including accounts nobody signs into any more,
 * which are the entire point of this job.
 */
export const NOTIFICATION_FEED_COLLECTION = 'notificationFeed';

/** Firestore's hard cap on writes in a single `WriteBatch`. */
export const FEED_PURGE_BATCH_SIZE = 500;

/**
 * Passes per run, so one invocation can't spin unboundedly on a backlog (or
 * on a delete that somehow never takes). At the batch size above this clears
 * up to 10,000 rows per daily run; a larger backlog simply continues on the
 * next tick rather than being dropped.
 */
export const FEED_PURGE_MAX_PASSES = 20;

/**
 * The `firedAt` a doc must be strictly below to be past retention. Exists so
 * index.ts can express the retention rule as a Firestore `where` filter — a
 * query can't call `isPastRetention` — while keeping the one boundary that
 * module's tests already pin. `isPurgeableFeedRow` below is what holds the
 * two in agreement.
 */
export function feedPurgeCutoff(nowMs: number, retentionMs: number = FIRED_RETENTION_MS): number {
  return nowMs - retentionMs;
}

/** True when `where('firedAt', '<', feedPurgeCutoff(nowMs))` would match this row. */
export function isPurgeableFeedRow(
  firedAt: number,
  nowMs: number,
  retentionMs: number = FIRED_RETENTION_MS
): boolean {
  return firedAt < feedPurgeCutoff(nowMs, retentionMs);
}
