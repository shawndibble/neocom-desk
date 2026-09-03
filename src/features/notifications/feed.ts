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
 * De-duplication is `pollerState.ts`'s job, not this module's — a fire only
 * reaches here once the poller has decided it is new, so ids are generated
 * rather than derived from the fire's contents.
 */
import { db, type NotificationFeedRecord } from '@/db';

/**
 * How many entries the feed keeps. Chosen to be comfortably more than a
 * session's worth of events while still bounding a table that only ever grows
 * — the panel shows the newest handful, and an entry nobody has looked at in
 * a hundred notifications is not one they are coming back for.
 */
export const NOTIFICATION_FEED_LIMIT = 100;

export type NotificationFeedEntry = NotificationFeedRecord;

/** What `recordFeedEntry` needs; the id is minted for you. */
export type NewNotificationFeedEntry = Omit<NotificationFeedEntry, 'id'>;

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
  await db.notificationFeed.put({ ...entry, id: crypto.randomUUID() });
  const stale = idsBeyondLimit(await readFeed(), NOTIFICATION_FEED_LIMIT);
  if (stale.length > 0) await db.notificationFeed.bulkDelete(stale);
}

export async function dismissFeedEntry(id: string): Promise<void> {
  await db.notificationFeed.delete(id);
}

export async function dismissAllFeedEntries(): Promise<void> {
  await db.notificationFeed.clear();
}
