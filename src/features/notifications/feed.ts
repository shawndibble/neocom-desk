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

/** Newest first. */
export async function readFeed(): Promise<NotificationFeedEntry[]> {
  return db.notificationFeed.orderBy('firedAt').reverse().toArray();
}

export async function recordFeedEntry(entry: NewNotificationFeedEntry): Promise<void> {
  await db.notificationFeed.put(entry);
  const stale = idsBeyondLimit(await readFeed(), NOTIFICATION_FEED_LIMIT);
  if (stale.length > 0) await db.notificationFeed.bulkDelete(stale);
  await refreshAppBadge();
}

export async function dismissFeedEntry(id: string): Promise<void> {
  await db.notificationFeed.delete(id);
  await refreshAppBadge();
}

/**
 * Bulk dismiss. Takes explicit ids rather than clearing the table: "dismiss
 * all" on the Overview means the active Character's alerts, and wiping
 * another Character's along with them would silently discard the very rows
 * the other-Characters row is counting.
 */
export async function dismissFeedEntries(ids: readonly string[]): Promise<void> {
  await db.notificationFeed.bulkDelete([...ids]);
  await refreshAppBadge();
}
