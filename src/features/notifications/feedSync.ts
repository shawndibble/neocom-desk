import { scheduleSync } from '@/sync';
import {
  dismissFeedEntries,
  recordFeedEntry,
  type NewNotificationFeedEntry,
  type NotificationFeedEntry,
} from './feed';

export async function dismissFeedEntriesAndSync(
  rows: readonly Pick<NotificationFeedEntry, 'id' | 'characterId'>[]
): Promise<void> {
  await dismissFeedEntries(rows.map((row) => row.id));
  for (const characterId of new Set(rows.map((row) => row.characterId)))
    scheduleSync(characterId, { collections: ['notificationFeed'] });
}

export async function dismissFeedKeysAndSync(
  characterIds: readonly number[],
  occurrenceKeys: readonly string[]
): Promise<void> {
  await dismissFeedEntries(occurrenceKeys);
  for (const characterId of new Set(characterIds))
    scheduleSync(characterId, { collections: ['notificationFeed'] });
}

export async function recordFeedEntryAndSync(entry: NewNotificationFeedEntry): Promise<void> {
  await recordFeedEntry(entry);
  scheduleSync(entry.characterId, { collections: ['notificationFeed'] });
}
