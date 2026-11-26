import { isEventEnabledFor, isEveTypeEnabledFor } from './eventSelection';
import {
  characterEventPrefs,
  characterEveTypePrefs,
  type NotificationPreferencesValue,
} from './preferencesStore';
import type { NotificationEventId } from './events';
import type { NotificationFeedRecord as NotificationFeedEntry } from '@/db';

export type EntryChannelTarget =
  { kind: 'eveType'; type: string } | { kind: 'event'; eventId: NotificationEventId };

export function entryChannelTarget(
  entry: Pick<NotificationFeedEntry, 'eventId' | 'eveType'>
): EntryChannelTarget {
  return entry.eveType !== undefined
    ? { kind: 'eveType', type: entry.eveType }
    : { kind: 'event', eventId: entry.eventId as NotificationEventId };
}

export function isEntryMutedInFeed(
  entry: NotificationFeedEntry,
  prefs: NotificationPreferencesValue
): boolean {
  const forCharacter = characterEventPrefs(prefs, entry.characterId);
  if (!isEventEnabledFor(forCharacter, entry.eventId as NotificationEventId, 'feed')) {
    return true;
  }
  const target = entryChannelTarget(entry);
  if (target.kind === 'eveType') {
    const eveTypePrefs = characterEveTypePrefs(prefs, entry.characterId);
    return !isEveTypeEnabledFor(eveTypePrefs, target.type, 'feed');
  }
  return false;
}

function isEntryVisible(
  entry: NotificationFeedEntry,
  prefs: NotificationPreferencesValue
): boolean {
  return entry.dismissedAt === undefined && !isEntryMutedInFeed(entry, prefs);
}

export function visibleFeedEntries(
  entries: readonly NotificationFeedEntry[],
  prefs: NotificationPreferencesValue
): NotificationFeedEntry[] {
  return entries.filter((entry) => isEntryVisible(entry, prefs));
}
