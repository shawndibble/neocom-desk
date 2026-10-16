import {
  loadCalendarEvents as loadCharacterCalendarEvents,
  prefetchCalendarEventDetails,
} from '@/features/character/calendar';
import { projectCalendar } from '@/engine/projection';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import { timeZoneFor, useTimeFormat } from '@/lib/timeFormat';
import type { CalendarEventSummary } from '@/esi/endpoints';
import {
  CALENDAR_EVENT_RESPONSES,
  type CalendarEventEntrySnapshot,
  type CalendarEventStartingFire,
  type CalendarSnapshot,
  type NewCalendarEventFire,
} from '@/engine/notificationDiffs';
import type { CalendarNames } from '../domainCopy';
import { NOTIFICATION_EVENT_ENTRIES, SNAPSHOT_SOURCES } from '../eventEntries';
import { is, shapeGuard } from '../snapshotShape';
import { defineDomain } from './defineDomain';

/* Calendar ------------------------------------------------------------------- */

/**
 * When a newly-added calendar event starts, in the pilot's chosen clock
 * (`lib/timeFormat.ts` — local, or EVE/UTC).
 *
 * Read through the store's `getState` rather than the `useTimeZone` hook: this
 * runs in the poll loop, not in a component. The preference is hydrated by the
 * time any poll runs (`ForegroundNotificationPoller` mounts inside the app),
 * and its default is the same 'local' every other surface used before the
 * preference existed, so a cold read is never wrong in a way a pilot notices.
 *
 * `undefined` when the snapshot carries no usable instant — the copy drops
 * the clause rather than printing "Invalid Date".
 */
function calendarStartLabel(startMs: number): string | undefined {
  if (!Number.isFinite(startMs)) return undefined;
  return formatCalendarTimestamp(new Date(startMs), timeZoneFor(useTimeFormat.getState().value));
}

/**
 * `title` and `response` are deliberately **not** required: this validates
 * persisted baselines, and a snapshot written before either field existed is
 * still a usable baseline. Rejecting it would discard the high-water mark and
 * re-announce every event on the calendar as new.
 */
const isCalendarEventEntrySnapshot = shapeGuard<CalendarEventEntrySnapshot>({
  calendarEventId: is.number,
  startMs: is.number,
  title: is.optional(is.string),
  response: is.optional(is.oneOf(CALENDAR_EVENT_RESPONSES)),
});

export const calendarDomain = defineDomain<
  CalendarEventSummary,
  CalendarSnapshot,
  NewCalendarEventFire | CalendarEventStartingFire,
  CalendarNames
>({
  source: SNAPSHOT_SOURCES.calendar,
  stateKey: 'notifications.pollerState.calendar',
  entriesKey: 'entries',
  isEntry: isCalendarEventEntrySnapshot,
  load: async (characterId) => {
    const result = await loadCharacterCalendarEvents(characterId);
    if (result.needsReauth || result.cached === null) return null;
    // Only after a read that reached ESI (a cache hit or an offline fallback
    // proves nothing landed); see `detailPrefetch.ts` for the triggers.
    if (!result.cached.fromCache)
      void prefetchCalendarEventDetails(characterId, result.cached.data);
    return result.cached.data;
  },
  toSnapshot: (events, nowMs) => ({
    entries: events.map((event) => ({
      calendarEventId: event.event_id,
      startMs: Date.parse(event.event_date),
      title: event.title,
      response: event.event_response,
    })),
    nowMs,
  }),
  // The one domain running two diffs off a single snapshot and a single fetch:
  // each is gated on its own event so switching one off leaves the other alone.
  // `newCalendarEvent` has no fixed future timestamp to project — only
  // `calendarEventStarting`'s `startMs` is; the pure `projectCalendar`
  // already emits `calendarEventStarting` rows exclusively.
  projection: async (characterId, characterName, snapshot, nowMs) =>
    projectCalendar(
      characterId,
      characterName,
      snapshot.entries,
      NOTIFICATION_EVENT_ENTRIES.calendarEventStarting.projection.push,
      nowMs
    ),
  names: async (fire) =>
    fire.eventId === 'newCalendarEvent' ? { when: calendarStartLabel(fire.startMs) } : {},
});
