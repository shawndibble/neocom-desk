/**
 * Filters Settings' per-character Notification sections by event-type name
 * or character name (issue #170), following the Trained Skills groups search
 * pattern (`skillGroupFilter.ts`, issue #108): a section with no match
 * disappears entirely; one with a match stays, showing only its matches — or
 * every event, when the match was on the character's own name.
 */
import type { NotificationEventId } from './events';

/** Search starts filtering sections at this many characters (matches skillGroupFilter.ts). */
export const NOTIFICATION_SEARCH_MIN_QUERY_LENGTH = 3;

export interface NotificationSection {
  characterId: number;
  characterName: string;
}

export interface NotificationEventLabel {
  id: NotificationEventId;
  label: string;
}

export interface NotificationSearchResult {
  /** Character ids whose section has at least one matching event or a matching character name. */
  visibleCharacterIds: ReadonlySet<number>;
  /** Event ids to show per visible character — every event when the character's own name matched. */
  visibleEventIdsByCharacter: ReadonlyMap<number, ReadonlySet<NotificationEventId>>;
}

/**
 * Null means "no filter active" (query under NOTIFICATION_SEARCH_MIN_QUERY_LENGTH) —
 * the caller renders every section at its own collapse state, in full.
 */
export function filterNotificationSections(
  sections: readonly NotificationSection[],
  events: readonly NotificationEventLabel[],
  query: string
): NotificationSearchResult | null {
  if (query.trim().length < NOTIFICATION_SEARCH_MIN_QUERY_LENGTH) return null;

  const q = query.trim().toLowerCase();
  const allEventIds: ReadonlySet<NotificationEventId> = new Set(events.map((event) => event.id));
  const matchedEventIds: ReadonlySet<NotificationEventId> = new Set(
    events.filter((event) => event.label.toLowerCase().includes(q)).map((event) => event.id)
  );

  const visibleCharacterIds = new Set<number>();
  const visibleEventIdsByCharacter = new Map<number, ReadonlySet<NotificationEventId>>();
  for (const section of sections) {
    if (section.characterName.toLowerCase().includes(q)) {
      visibleCharacterIds.add(section.characterId);
      visibleEventIdsByCharacter.set(section.characterId, allEventIds);
    } else if (matchedEventIds.size > 0) {
      visibleCharacterIds.add(section.characterId);
      visibleEventIdsByCharacter.set(section.characterId, matchedEventIds);
    }
  }
  return { visibleCharacterIds, visibleEventIdsByCharacter };
}
