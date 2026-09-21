/** Fetch + cache layer for the Calendar view: event list + one detail on demand. */
import {
  getCharacterCalendar,
  getCharacterCalendarEvent,
  putCharacterCalendarResponse,
  type CalendarEventSummary,
  type CalendarEventDetail,
  type CalendarRsvpResponse,
} from '@/esi/endpoints';
import {
  loadWithCache,
  loadWithCacheStatus,
  readCached,
  writeCached,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';
import { isAuthFailure } from '@/esi/client';
import { emitEsiAuthFailure } from '@/esi/authFailureSignal';
import { parseInstant } from '@/engine/esiInstant';
import { stillRunning, type CalendarRetentionEntry } from '@/engine/character/calendarRetention';

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

/**
 * Every event's start, parsed once.
 *
 * Once, because the string would otherwise be parsed to build the retention
 * entries, again on each comparison during the sort, and a third time in the
 * poller's own snapshot. An event whose `event_date` will not parse is simply
 * absent from the map — that is what keeps a `NaN` out of the engine
 * (`esiInstant.ts`), the same contract `board.ts`'s `deadlineMs` states.
 *
 * It is **not** dropped from the list: an unparseable date makes an event
 * impossible to place on a clock, not impossible to show, and the view has
 * always listed it.
 */
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

/** Same events in the same order — the cheap check that skips a pointless write. */
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
  const starts = startsById([...fresh, ...seen]);
  const retainedIds = new Set(
    stillRunning(toRetentionEntries(seen, starts), toRetentionEntries(fresh, starts), nowMs)
  );

  const merged = [...fresh, ...seen.filter((event) => retainedIds.has(event.event_id))];
  // A retained event is spliced in ahead of ESI's already-ordered list, so the
  // union has to be re-ordered. An undated event sinks rather than throwing or
  // comparing as NaN.
  merged.sort(
    (a, b) =>
      (starts.get(a.event_id) ?? Number.POSITIVE_INFINITY) -
      (starts.get(b.event_id) ?? Number.POSITIVE_INFINITY)
  );

  // Only when it actually changed. This runs on every poll tick, every
  // `/calendar` mount and every prefetch warm, and the union is identical
  // almost every time — `app/prefetch.ts` promises warming twice inside ten
  // minutes costs one Dexie *read*, which an unconditional write would break.
  if (!sameEvents(merged, seen)) await writeCached(characterId, KEYS.seenEvents, merged, nowMs);
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

/**
 * Pushes an RSVP write to ESI. Errors are otherwise swallowed — same
 * contract as `mail.ts`'s `markMailReadOnEsi` — but an auth failure still
 * signals the app-wide reauth banner (`emitEsiAuthFailure`): a token that
 * predates this scope's addition (same shape as `organize_mail`, issue
 * #741) would otherwise fail silently on every click with no way for the
 * user to learn a re-login would fix it.
 *
 * Returns whether the write actually reached ESI — unlike
 * `markMailReadOnEsi`'s `void`, a caller here (`EventDetailModal`) shows the
 * new response optimistically in its own local state, and must not do that
 * for a call this function silently swallowed.
 *
 * On success, patches every cache row that carries response state rather
 * than refetching: the list (`event_response`), the started-event carryover
 * (`calendar:seen`, same field — an already-started event must not show a
 * stale response after a successful write), and the per-event detail
 * (`response`, a different field name on a different shape).
 */
export async function respondToCalendarEvent(
  characterId: number,
  eventId: number,
  response: CalendarRsvpResponse
): Promise<boolean> {
  try {
    await putCharacterCalendarResponse(characterId, eventId, response);
  } catch (err) {
    if (isAuthFailure(err)) emitEsiAuthFailure(characterId);
    return false;
  }

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

  return true;
}
