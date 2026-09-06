/**
 * The Notification Feed: every notification the Foreground Poller fired,
 * kept on the device so the Overview can show what was missed.
 *
 * This is the one delivery channel that works everywhere. A browser
 * notification needs a permission grant and a platform that can show one —
 * iOS has no way to raise one while the app is closed, and no background
 * execution to poll from in the first place (ADR 0007). The feed has neither
 * constraint: whatever the poller diffed while the app was open is here,
 * whether or not the OS ever drew a bubble for it.
 *
 * Per-device de-duplication is `pollerState.ts`'s job, not this module's — a
 * fire only reaches here once the poller has decided it is new locally. This
 * module's row id is the caller-supplied Occurrence Key (issue #348,
 * `engine/occurrenceKey.ts`), not a minted one: a `put` with the same id
 * upserts, which is what makes a second device or the Scheduled Push backend
 * recording the same occurrence collapse into the one row instead of two.
 * What that upsert must *not* take from the later sighting is the row's
 * `firedAt` or `dismissedAt` — see `mergeFeedRecord`.
 */
import { db, type NotificationFeedRecord } from '@/db';
import { refreshAppBadge } from './appBadge';

/**
 * How many entries the feed keeps. Originally chosen for ten low-frequency
 * synthesized events; issue #274 adds a domain covering roughly a hundred
 * EVE-native types, most far more frequent than any of the original ten, so
 * the cap is raised threefold to keep a session's worth of the new volume
 * from crowding out everything else — still bounding a table that only ever
 * grows, not an attempt to size it exactly.
 */
export const NOTIFICATION_FEED_LIMIT = 300;

export type NotificationFeedEntry = NotificationFeedRecord;

/** What `recordFeedEntry` needs, including its id — the caller's Occurrence Key. */
export type NewNotificationFeedEntry = NotificationFeedEntry;

/**
 * Which ids fall outside the cap, given the feed newest-first. Pure so the
 * trim rule is testable without a database.
 */
export function idsBeyondLimit(newestFirst: readonly { id: string }[], limit: number): string[] {
  return newestFirst.slice(limit).map((entry) => entry.id);
}

/**
 * The synced window (issue #362, CONTEXT.md round 45): 30 days or 100 rows,
 * whichever is smaller, against the local {@link NOTIFICATION_FEED_LIMIT} of
 * 300. Only rows in this window are eligible to be *pushed* during a sync —
 * the fuller local archive stays device-local. Pure so it's testable without
 * a database; the caller passes the feed newest-first (as `readFeed` returns
 * it).
 */
export const FEED_SYNC_WINDOW_MAX_ROWS = 100;
export const FEED_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function rowsWithinSyncWindow<T extends { firedAt: number }>(
  newestFirst: readonly T[],
  now: number,
  maxRows: number = FEED_SYNC_WINDOW_MAX_ROWS,
  windowMs: number = FEED_SYNC_WINDOW_MS
): T[] {
  const cutoff = now - windowMs;
  return newestFirst.filter((entry) => entry.firedAt >= cutoff).slice(0, maxRows);
}

/** Newest first. */
export async function readFeed(): Promise<NotificationFeedEntry[]> {
  return db.notificationFeed.orderBy('firedAt').reverse().toArray();
}

/**
 * How two sightings of one Occurrence Key combine.
 *
 * The same row is written by several parties — the other device, the
 * Scheduled Push backend, this device's poller re-diffing against a baseline
 * that predates the row, and `sync/planSync`'s pull — and each writes the
 * whole record. Left alone, the newest write wins every field: it restamps
 * the row to the moment of the *later* sighting and drops the dismissal with
 * it, so alerts the user had already cleared come back, at the top of the
 * list, dated now.
 *
 * Two fields are therefore not the newest writer's to set:
 *
 * - `firedAt` takes the **earlier** of the two, not simply the stored one, so
 *   the outcome does not depend on which sighting arrived first. The parties
 *   disagree on purpose: a push stamps its own arrival (`pushHandler.ts`)
 *   while the poller stamps the occurrence itself
 *   (`engine/occurrenceKey.occurrenceFiredAt`), and the earlier of the two is
 *   the closer to when it really happened.
 * - `dismissedAt` takes the **later**, absent counting as never — the same
 *   last-write-wins policy `sync/merge.mergeFeed` uses to decide which side's
 *   dismissal to carry across, so a local dismissal survives a re-record and
 *   a remote one still applies on a pull.
 *
 * Everything else — the copy — comes from the newer write.
 */
export function mergeFeedRecord(
  existing: NotificationFeedEntry | undefined,
  incoming: NotificationFeedEntry
): NotificationFeedEntry {
  if (existing === undefined) return incoming;
  const dismissedAt = Math.max(existing.dismissedAt ?? 0, incoming.dismissedAt ?? 0);
  return {
    ...incoming,
    firedAt: Math.min(existing.firedAt, incoming.firedAt),
    ...(dismissedAt > 0 ? { dismissedAt } : {}),
  };
}

/**
 * Drops whatever sits past the cap, except the rows the caller just wrote.
 *
 * That exclusion is why this is a function rather than two lines at each call
 * site: a row can now be dated days back
 * (`engine/occurrenceKey.occurrenceFiredAt`), so an incoming row really can
 * sort past the cut line — and deleting an alert in the same breath as
 * raising it leaves nothing to re-fire it, the poller's baseline having
 * already advanced past it. It ages out through an ordinary later trim
 * instead, which is the bound this cap is actually for.
 *
 * The `count` guard keeps the common case cheap: the feed is under the cap
 * almost always, and `readFeed` materialises every row to sort it.
 */
export async function trimFeed(justWritten: ReadonlySet<string>): Promise<void> {
  if ((await db.notificationFeed.count()) <= NOTIFICATION_FEED_LIMIT) return;
  const stale = idsBeyondLimit(await readFeed(), NOTIFICATION_FEED_LIMIT).filter(
    (id) => !justWritten.has(id)
  );
  if (stale.length > 0) await db.notificationFeed.bulkDelete(stale);
}

/**
 * Records one occurrence, merged with whatever is already stored under its
 * Occurrence Key (`mergeFeedRecord`).
 *
 * Read-modify-write inside one `rw` transaction: the page's poller and the
 * Service Worker's push handler (`sw.ts`) write this table from separate JS
 * contexts, and a `dismissFeedEntry` landing between a bare `get` and its
 * `put` would be written straight back out — resurrecting the dismissal the
 * merge exists to protect.
 */
export async function recordFeedEntry(entry: NewNotificationFeedEntry): Promise<void> {
  await db.transaction('rw', db.notificationFeed, async () => {
    const existing = await db.notificationFeed.get(entry.id);
    await db.notificationFeed.put(mergeFeedRecord(existing, entry));
    await trimFeed(new Set([entry.id]));
  });
  await refreshAppBadge();
}

/**
 * A flag rather than a delete, so this collection carries no tombstones —
 * see `dismissedAt` on `NotificationFeedRecord` for why that matters once
 * the feed syncs (issue #361).
 */
export async function dismissFeedEntry(id: string): Promise<void> {
  await db.notificationFeed.update(id, { dismissedAt: Date.now() });
  await refreshAppBadge();
}

/**
 * Bulk dismiss. Takes explicit ids rather than clearing the table: "dismiss
 * all" on the Overview means the active Character's alerts, and wiping
 * another Character's along with them would silently discard the very rows
 * the other-Characters row is counting.
 */
export async function dismissFeedEntries(ids: readonly string[]): Promise<void> {
  await db.notificationFeed
    .where('id')
    .anyOf([...ids])
    .modify({ dismissedAt: Date.now() });
  await refreshAppBadge();
}

/**
 * Whether an Occurrence Key already has a feed row — the Foreground Poller's
 * dedup check against a Scheduled Push (or another device) that already
 * delivered this exact occurrence (issue #360). A thin read, but exported so
 * `foregroundPoller.ts` never has to know the row's id *is* the Occurrence
 * Key to look one up.
 */
export async function feedHasOccurrence(occurrenceKey: string): Promise<boolean> {
  return (await db.notificationFeed.get(occurrenceKey)) !== undefined;
}

/** Every feed row for one Character (`removeCharacter.ts`'s local cleanup). */
export async function deleteFeedForCharacter(characterId: number): Promise<void> {
  await db.notificationFeed.where('characterId').equals(characterId).delete();
}
