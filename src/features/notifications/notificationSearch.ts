/**
 * Filters Settings' Notification rows by event name, EVE notification type
 * name or character name (issue #170), following the Trained Skills groups search pattern
 * (`skillGroupFilter.ts`, issue #108).
 */
import type { NotificationEventId } from './events';

/** Search starts filtering sections at this many characters (matches skillGroupFilter.ts). */
export const NOTIFICATION_SEARCH_MIN_QUERY_LENGTH = 3;

export interface NotificationCharacter {
  characterId: number;
  characterName: string;
}

export interface NotificationEventLabel {
  id: NotificationEventId;
  label: string;
}

/** One EVE notification type (ESI's raw `type`) and the name a pilot reads for it. */
export interface NotificationEveTypeLabel {
  type: string;
  label: string;
}

export interface NotificationEventSearchResult {
  /** Events whose row stays on the page. */
  visibleEventIds: ReadonlySet<NotificationEventId>;
  /** EVE notification types listed under the EVE notifications row; empty unless the query names some. */
  visibleEveTypes: ReadonlySet<string>;
  /** Characters whose chips stay in an expanded row; `null` means every Character. */
  characterIds: ReadonlySet<number> | null;
}

/** The one event row the EVE notification types are filed under. */
const EVE_EVENT_ID: NotificationEventId = 'eveNotification';

/**
 * The event-first page's search: a query that names events or EVE notification
 * types narrows the rows and keeps every Character; one that names only
 * Characters keeps every row and narrows the chips to those Characters ("show
 * me Pilot One's settings"). A matching EVE type pulls in the EVE notifications
 * row and lists just the types that matched, so a pilot can find "Structure
 * Fuel Alert" without the hundred-row type list. Events and types win over
 * Characters, so a row you named never disappears. Null means no filter is
 * active.
 */
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
