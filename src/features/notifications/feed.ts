import { DAY_MS } from '@/lib/age';
import { db, type NotificationFeedRecord } from '@/db';
import { refreshAppBadge } from './appBadge';

export const NOTIFICATION_FEED_LIMIT = 300;

export type NotificationFeedEntry = NotificationFeedRecord;

export type NewNotificationFeedEntry = NotificationFeedEntry;

export function idsBeyondLimit(newestFirst: readonly { id: string }[], limit: number): string[] {
  return newestFirst.slice(limit).map((entry) => entry.id);
}

export const FEED_SYNC_WINDOW_MAX_ROWS = 100;
export const FEED_SYNC_WINDOW_MS = 30 * DAY_MS;

const DEVICE_LOCAL_EVENT_IDS: ReadonlySet<string> = new Set(['characterNeedsLogin']);

export function isDeviceLocalFeedRow(row: { eventId: string }): boolean {
  return DEVICE_LOCAL_EVENT_IDS.has(row.eventId);
}

export function rowsWithinSyncWindow<T extends { firedAt: number }>(
  newestFirst: readonly T[],
  now: number,
  maxRows: number = FEED_SYNC_WINDOW_MAX_ROWS,
  windowMs: number = FEED_SYNC_WINDOW_MS
): T[] {
  const cutoff = now - windowMs;
  return newestFirst.filter((entry) => entry.firedAt >= cutoff).slice(0, maxRows);
}

export async function readFeed(): Promise<NotificationFeedEntry[]> {
  return db.notificationFeed.orderBy('firedAt').reverse().toArray();
}

function definedFieldsOf(entry: NotificationFeedEntry): Partial<NotificationFeedEntry> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined)
  ) as Partial<NotificationFeedEntry>;
}

export function mergeFeedRecord(
  existing: NotificationFeedEntry | undefined,
  incoming: NotificationFeedEntry
): NotificationFeedEntry {
  if (existing === undefined) return incoming;
  const dismissedAt = Math.max(existing.dismissedAt ?? 0, incoming.dismissedAt ?? 0);
  return {
    ...existing,
    ...definedFieldsOf(incoming),
    firedAt: Math.min(existing.firedAt, incoming.firedAt),
    ...(dismissedAt > 0 ? { dismissedAt } : {}),
  };
}

export async function trimFeed(justWritten: ReadonlySet<string>): Promise<void> {
  if ((await db.notificationFeed.count()) <= NOTIFICATION_FEED_LIMIT) return;
  const stale = idsBeyondLimit(await readFeed(), NOTIFICATION_FEED_LIMIT).filter(
    (id) => !justWritten.has(id)
  );
  if (stale.length > 0) await db.notificationFeed.bulkDelete(stale);
}

export async function recordFeedEntry(entry: NewNotificationFeedEntry): Promise<void> {
  await db.transaction('rw', db.notificationFeed, async () => {
    const existing = await db.notificationFeed.get(entry.id);
    await db.notificationFeed.put(mergeFeedRecord(existing, entry));
    await trimFeed(new Set([entry.id]));
  });
  await refreshAppBadge();
}

export async function dismissFeedEntry(id: string): Promise<void> {
  await db.notificationFeed.update(id, { dismissedAt: Date.now() });
  await refreshAppBadge();
}

export async function dismissFeedEntries(ids: readonly string[]): Promise<void> {
  await db.notificationFeed
    .where('id')
    .anyOf([...ids])
    .modify({ dismissedAt: Date.now() });
  await refreshAppBadge();
}

export const TOAST_STALE_AFTER_MS = DAY_MS;

export function rowSuppressesToast(row: NotificationFeedEntry | undefined, now: number): boolean {
  if (row === undefined) return false;
  if (row.notifiedHereAt !== undefined || row.dismissedAt !== undefined) return true;
  return now - row.firedAt > TOAST_STALE_AFTER_MS;
}

export async function feedSuppressesToast(occurrenceKey: string, now: number): Promise<boolean> {
  return rowSuppressesToast(await db.notificationFeed.get(occurrenceKey), now);
}

export async function markFeedNotifiedHere(
  occurrenceKeys: readonly string[],
  at: number
): Promise<void> {
  await db.notificationFeed
    .where('id')
    .anyOf([...occurrenceKeys])
    .modify({ notifiedHereAt: at });
}

export async function deleteFeedForCharacter(characterId: number): Promise<void> {
  await db.notificationFeed.where('characterId').equals(characterId).delete();
}

export type ProvisionalFillRow = NotificationFeedEntry & {
  fillMatch: NonNullable<NotificationFeedEntry['fillMatch']>;
};

export function isProvisionalFill(row: NotificationFeedEntry): row is ProvisionalFillRow {
  return (
    row.eventId === 'marketOrderFilled' &&
    row.fillMatch !== undefined &&
    row.fillSettledAt === undefined
  );
}
