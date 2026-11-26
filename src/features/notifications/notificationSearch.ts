import type { NotificationEventId } from './events';

export const NOTIFICATION_SEARCH_MIN_QUERY_LENGTH = 3;

export interface NotificationCharacter {
  characterId: number;
  characterName: string;
}

export interface NotificationEventLabel {
  id: NotificationEventId;
  label: string;
}

export interface NotificationEveTypeLabel {
  type: string;
  label: string;
}

export interface NotificationEventSearchResult {
  visibleEventIds: ReadonlySet<NotificationEventId>;
  visibleEveTypes: ReadonlySet<string>;
  characterIds: ReadonlySet<number> | null;
}

const EVE_EVENT_ID: NotificationEventId = 'eveNotification';

export function filterNotificationEvents(
  characters: readonly NotificationCharacter[],
  events: readonly NotificationEventLabel[],
  query: string,
  eveTypes: readonly NotificationEveTypeLabel[] = []
): NotificationEventSearchResult | null {
  if (query.trim().length < NOTIFICATION_SEARCH_MIN_QUERY_LENGTH) return null;
  const q = query.trim().toLowerCase();
  const matchedEvents = events.filter((event) => event.label.toLowerCase().includes(q));
  const matchedTypes = eveTypes.filter((entry) => entry.label.toLowerCase().includes(q));
  if (matchedEvents.length > 0 || matchedTypes.length > 0) {
    const visibleEventIds = new Set(matchedEvents.map((event) => event.id));
    if (matchedTypes.length > 0) visibleEventIds.add(EVE_EVENT_ID);
    return {
      visibleEventIds,
      visibleEveTypes: new Set(matchedTypes.map((entry) => entry.type)),
      characterIds: null,
    };
  }
  const matchedCharacters = characters.filter((c) => c.characterName.toLowerCase().includes(q));
  if (matchedCharacters.length > 0) {
    return {
      visibleEventIds: new Set(events.map((event) => event.id)),
      visibleEveTypes: new Set(),
      characterIds: new Set(matchedCharacters.map((c) => c.characterId)),
    };
  }
  return { visibleEventIds: new Set(), visibleEveTypes: new Set(), characterIds: null };
}
