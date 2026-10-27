/**
 * Filters Settings' Notification rows by event-type name or character name
 * (issue #170), following the Trained Skills groups search pattern
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

export interface NotificationEventSearchResult {
  /** Events whose row stays on the page. */
  visibleEventIds: ReadonlySet<NotificationEventId>;
  /** Characters whose chips stay in an expanded row; `null` means every Character. */
  characterIds: ReadonlySet<number> | null;
}

/**
 * The event-first page's search: a query that names events narrows the rows
 * and keeps every Character; one that names only Characters keeps every row
 * and narrows the chips to those Characters ("show me Pilot One's settings").
 * Events win when both match, so a row you named never disappears. Null means
 * no filter is active.
 */
export function filterNotificationEvents(
  characters: readonly NotificationCharacter[],
  events: readonly NotificationEventLabel[],
  query: string
): NotificationEventSearchResult | null {
  if (query.trim().length < NOTIFICATION_SEARCH_MIN_QUERY_LENGTH) return null;
  const q = query.trim().toLowerCase();
  const matchedEvents = events.filter((event) => event.label.toLowerCase().includes(q));
  if (matchedEvents.length > 0) {
    return { visibleEventIds: new Set(matchedEvents.map((event) => event.id)), characterIds: null };
  }
  const matchedCharacters = characters.filter((c) => c.characterName.toLowerCase().includes(q));
  if (matchedCharacters.length > 0) {
    return {
      visibleEventIds: new Set(events.map((event) => event.id)),
      characterIds: new Set(matchedCharacters.map((c) => c.characterId)),
    };
  }
  return { visibleEventIds: new Set(), characterIds: null };
}
