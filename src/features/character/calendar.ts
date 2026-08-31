/** Fetch + cache layer for the Calendar view: event list + one detail on demand. */
import {
  getCharacterCalendar,
  getCharacterCalendarEvent,
  type CalendarEventSummary,
  type CalendarEventDetail,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

const KEYS = {
  events: 'calendar',
  event: (eventId: number) => `calendar:${eventId}`,
} as const;

/**
 * Upcoming/recent calendar events. ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the calendar scope was revoked (issue #14).
 */
export function loadCalendarEvents(
  characterId: number
): Promise<StatusResult<CalendarEventSummary[]>> {
  return loadWithCacheStatus(
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
