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
  readCached,
  writeCached,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { parseInstant } from '@/engine/esiInstant';
import {
  stillRunningToday,
  type CalendarRetentionEntry,
} from '@/engine/character/calendarRetention';

const KEYS = {
  events: 'calendar',
  /**
   * The events this device has *seen*, as opposed to the ones ESI is willing
   * to return right now. Deliberately a second row rather than a merge into
   * `events`: that row is the raw endpoint response, and every other cache row
   * in the app means "what ESI last said". Keeping the union somewhere else
   * leaves that invariant intact and makes the retention layer removable.
   *
   * Cannot collide with the per-event detail keys below — those end in an
   * event id, which is always numeric.
   */
  seenEvents: 'calendar:seen',
  event: (eventId: number) => `calendar:${eventId}`,
} as const;

function toRetentionEntry(event: CalendarEventSummary): CalendarRetentionEntry {
  return { id: event.event_id, startMs: parseInstant(event.event_date) ?? Number.NaN };
}

/**
 * Chronological, on the parsed instant rather than on the raw string: a
 * retained event is spliced in ahead of ESI's own already-ordered list, so the
 * union has to be re-ordered, and an undated row (one written by an older
 * build) must sink rather than throw or compare as NaN.
 */
function byStart(a: CalendarEventSummary, b: CalendarEventSummary): number {
  const left = parseInstant(a.event_date);
  const right = parseInstant(b.event_date);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/**
 * ESI's read, plus the events it dropped only because they have already
 * started today (`engine/character/calendarRetention.ts`).
 *
 * Applied here rather than in either consumer so `/calendar`'s map, rail and
 * ticker and the Foreground Poller's calendar domain get one answer from one
 * place — a board that lists a running fleet op while the poller's snapshot
 * has forgotten it would be two opinions about what is on today.
 */
async function withStartedEventsRetained(
  characterId: number,
  fresh: readonly CalendarEventSummary[],
  nowMs: number
): Promise<CalendarEventSummary[]> {
  const seen = (await readCached<CalendarEventSummary[]>(characterId, KEYS.seenEvents)) ?? [];
  const retainedIds = new Set(
    stillRunningToday(seen.map(toRetentionEntry), fresh.map(toRetentionEntry), nowMs)
  );
  const merged = [...fresh, ...seen.filter((event) => retainedIds.has(event.event_id))];
  merged.sort(byStart);
  // Written back as the union, so an event that started this morning survives
  // every poll for the rest of the day rather than only the first one after
  // ESI dropped it.
  await writeCached(characterId, KEYS.seenEvents, merged, nowMs);
  return merged;
}

/**
 * Upcoming events, plus today's already-running ones. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the calendar scope was revoked (issue #14).
 */
export async function loadCalendarEvents(
  characterId: number
): Promise<StatusResult<CalendarEventSummary[]>> {
  const result = await loadWithCacheStatus(
    characterId,
    KEYS.events,
    async () => (await getCharacterCalendar(characterId)).data
  );
  // Nothing read and nothing cached: a revoked scope or a cold offline start.
  // Retention has no read to add to, and must not invent one from a stale
  // seen-list — the view's "needs re-login" state has to stay reachable.
  if (result.cached === null) return result;
  const data = await withStartedEventsRetained(characterId, result.cached.data, Date.now());
  return { ...result, cached: { ...result.cached, data } };
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
