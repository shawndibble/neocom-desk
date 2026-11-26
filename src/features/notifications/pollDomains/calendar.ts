import {
  loadCalendarEvents as loadCharacterCalendarEvents,
  prefetchCalendarEventDetails,
} from '@/features/character/calendar';
import { sharedPopEventMatcher } from '@/features/character/calendarSharedPops';
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
import { alertedSharedPops } from './sharedMoonPops';

function calendarStartLabel(startMs: number): string | undefined {
  if (!Number.isFinite(startMs)) return undefined;
  return formatCalendarTimestamp(new Date(startMs), timeZoneFor(useTimeFormat.getState().value));
}

const isCalendarEventEntrySnapshot = shapeGuard<CalendarEventEntrySnapshot>({
  calendarEventId: is.number,
  startMs: is.number,
  title: is.optional(is.string),
  response: is.optional(is.oneOf(CALENDAR_EVENT_RESPONSES)),
});

async function withoutSharedPopEvents(
  characterId: number,
  events: CalendarEventSummary[]
): Promise<CalendarEventSummary[]> {
  const pops = await alertedSharedPops(characterId);
  if (pops.length === 0) return events;
  const isPop = sharedPopEventMatcher(pops, new Set(), Date.now(), 'asShared');
  return events.filter((event) => !isPop(event.title, Date.parse(event.event_date)));
}

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
    if (!result.cached.fromCache)
      void prefetchCalendarEventDetails(characterId, result.cached.data);
    return withoutSharedPopEvents(characterId, result.cached.data);
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
