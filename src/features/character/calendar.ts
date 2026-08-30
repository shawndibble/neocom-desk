/** Fetch + cache layer for the Calendar view: event list + one detail on demand. */
import {
  getCharacterCalendar,
  getCharacterCalendarEvent,
  type CalendarEventSummary,
  type CalendarEventDetail,
} from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from '@/esi/cache';

const KEYS = {
  events: 'calendar',
  event: (eventId: number) => `calendar:${eventId}`,
} as const;

/** Upcoming/recent calendar events. ESI or cache. */
export function loadCalendarEvents(
  characterId: number
): Promise<CachedResult<CalendarEventSummary[]> | null> {
  return loadWithCache(
    characterId,
    KEYS.events,
    async () => (await getCharacterCalendar(characterId)).data
  );
}

/** One event's full detail, fetched on open. ESI or cache. */
export function loadCalendarEvent(
  characterId: number,
  eventId: number
): Promise<CachedResult<CalendarEventDetail> | null> {
  return loadWithCache(
    characterId,
    KEYS.event(eventId),
    async () => (await getCharacterCalendarEvent(characterId, eventId)).data
  );
}
