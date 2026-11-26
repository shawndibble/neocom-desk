import {
  getCharacterCalendar,
  getCharacterCalendarEvent,
  putCharacterCalendarResponse,
  type CalendarEventSummary,
  type CalendarEventDetail,
  type CalendarRsvpResponse,
} from '@/esi/endpoints';
import { loadWithCacheStatus, readCached, writeCached, type StatusResult } from '@/esi/cache';
import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import { parseInstant } from '@/engine/esiInstant';
import { selectCalendarEventsToPrefetch } from '@/engine/character/calendarPrefetch';
import { CALENDAR_PREFETCH_DAYS, CALENDAR_PREFETCH_LIMIT, prefetchMissing } from './detailPrefetch';
import { stillRunning, type CalendarRetentionEntry } from '@/engine/character/calendarRetention';
import { MINUTE_MS, DAY_MS } from '@/lib/age';

const KEYS = {
  events: 'calendar',
  seenEvents: 'calendar:seen',
  event: (eventId: number) => `calendar:${eventId}`,
} as const;

function startsById(events: readonly CalendarEventSummary[]): Map<number, number> {
  const starts = new Map<number, number>();
  for (const event of events) {
    const startMs = parseInstant(event.event_date);
    if (startMs !== null) starts.set(event.event_id, startMs);
  }
  return starts;
}

function toRetentionEntries(
  events: readonly CalendarEventSummary[],
  starts: ReadonlyMap<number, number>
): CalendarRetentionEntry[] {
  const entries: CalendarRetentionEntry[] = [];
  for (const event of events) {
    const startMs = starts.get(event.event_id);
    if (startMs !== undefined) entries.push({ id: event.event_id, startMs });
  }
  return entries;
}

function sameEvents(a: readonly CalendarEventSummary[], b: readonly CalendarEventSummary[]) {
  return (
    a.length === b.length &&
    a.every((event, i) => {
      const other = b[i];
      return (
        event.event_id === other.event_id &&
        event.event_date === other.event_date &&
        event.title === other.title &&
        event.importance === other.importance &&
        event.event_response === other.event_response
      );
    })
  );
}

async function withStartedEventsRetained(
  characterId: number,
  fresh: readonly CalendarEventSummary[],
  nowMs: number
): Promise<CalendarEventSummary[]> {
  const seen = (await readCached<CalendarEventSummary[]>(characterId, KEYS.seenEvents)) ?? [];
  const starts = startsById([...fresh, ...seen]);
  const retainedIds = new Set(
    stillRunning(toRetentionEntries(seen, starts), toRetentionEntries(fresh, starts), nowMs)
  );

  const merged = [...fresh, ...seen.filter((event) => retainedIds.has(event.event_id))];
  merged.sort(
    (a, b) =>
      (starts.get(a.event_id) ?? Number.POSITIVE_INFINITY) -
      (starts.get(b.event_id) ?? Number.POSITIVE_INFINITY)
  );

  if (!sameEvents(merged, seen)) await writeCached(characterId, KEYS.seenEvents, merged, nowMs);
  return merged;
}

export async function loadCalendarEvents(
  characterId: number
): Promise<StatusResult<CalendarEventSummary[]>> {
  const result = await loadWithCacheStatus(
    characterId,
    KEYS.events,
    async () => (await getCharacterCalendar(characterId)).data,
    { staleAfterMs: 2 * MINUTE_MS }
  );
  if (result.cached === null) return result;
  const data = await withStartedEventsRetained(characterId, result.cached.data, Date.now());
  return { ...result, cached: { ...result.cached, data } };
}

export function loadCalendarEvent(
  characterId: number,
  eventId: number
): Promise<StatusResult<CalendarEventDetail>> {
  return loadWithCacheStatus(
    characterId,
    KEYS.event(eventId),
    async () => (await getCharacterCalendarEvent(characterId, eventId)).data
  );
}

export function prefetchCalendarEventDetails(
  characterId: number,
  events: readonly CalendarEventSummary[],
  nowMs: number = Date.now()
): Promise<void> {
  return prefetchMissing({
    kind: 'calendar-event',
    characterId,
    allIds: events.map((event) => event.event_id),
    keyOf: KEYS.event,
    select: (skip) =>
      selectCalendarEventsToPrefetch(events, {
        nowMs,
        horizonMs: CALENDAR_PREFETCH_DAYS * DAY_MS,
        cachedIds: skip,
        limit: CALENDAR_PREFETCH_LIMIT,
      }),
    load: (eventId) => loadCalendarEvent(characterId, eventId),
  });
}

export type RsvpResult = 'saved' | 'offline' | 'unconfirmed' | 'failed';

export async function respondToCalendarEvent(
  characterId: number,
  eventId: number,
  response: CalendarRsvpResponse
): Promise<RsvpResult> {
  try {
    await putCharacterCalendarResponse(characterId, eventId, response);
  } catch (err) {
    if (isOfflineFailure(err)) return isUnconfirmedWrite(err) ? 'unconfirmed' : 'offline';
    await reportWriteAuthFailure(characterId, err, 'putCharacterCalendarResponse');
    return 'failed';
  }

  try {
    const now = Date.now();
    for (const key of [KEYS.events, KEYS.seenEvents]) {
      const events = await readCached<CalendarEventSummary[]>(characterId, key);
      if (!events) continue;
      await writeCached(
        characterId,
        key,
        events.map((event) =>
          event.event_id === eventId ? { ...event, event_response: response } : event
        ),
        now
      );
    }

    const detail = await readCached<CalendarEventDetail>(characterId, KEYS.event(eventId));
    if (detail) await writeCached(characterId, KEYS.event(eventId), { ...detail, response }, now);
  } catch {}

  return 'saved';
}
