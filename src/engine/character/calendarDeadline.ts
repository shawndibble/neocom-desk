/**
 * What the Overview's "Next deadline" strip draws from the calendar: the
 * soonest upcoming event the pilot has actually committed to.
 *
 * Only `accepted` and `tentative` responses qualify — a `declined` or
 * `not_responded` event is not a plan the pilot has made, so it must not
 * lead the board the way a real deadline does.
 */
import type { CalendarEventSummary } from '@/esi/endpoints';
import { parseInstant } from '../esiInstant';

export interface CalendarDeadlineItem {
  eventId: number;
  atMs: number;
  title: string;
}

const COMMITTED_RESPONSES: ReadonlySet<CalendarEventSummary['event_response']> = new Set([
  'accepted',
  'tentative',
]);

export function soonestCalendarDeadline(
  events: readonly CalendarEventSummary[],
  nowMs: number
): CalendarDeadlineItem | null {
  let soonest: CalendarDeadlineItem | null = null;
  for (const event of events) {
    if (!COMMITTED_RESPONSES.has(event.event_response)) continue;
    const atMs = parseInstant(event.event_date);
    if (atMs === null || atMs <= nowMs) continue;
    if (soonest === null || atMs < soonest.atMs) {
      soonest = { eventId: event.event_id, atMs, title: event.title };
    }
  }
  return soonest;
}

export interface UpcomingCalendarEvent extends CalendarDeadlineItem {
  response: CalendarEventSummary['event_response'];
}

export interface CommittedCalendarEvent extends UpcomingCalendarEvent {
  response: 'accepted' | 'tentative';
}

/** Every event still ahead whatever the pilot answered, soonest first: the Coming up card's "All events" choice. */
export function upcomingEvents(
  events: readonly CalendarEventSummary[],
  nowMs: number
): UpcomingCalendarEvent[] {
  const upcoming: UpcomingCalendarEvent[] = [];
  for (const event of events) {
    const atMs = parseInstant(event.event_date);
    if (atMs === null || atMs <= nowMs) continue;
    upcoming.push({
      eventId: event.event_id,
      atMs,
      title: event.title,
      response: event.event_response,
    });
  }
  return upcoming.sort((a, b) => a.atMs - b.atMs);
}

/**
 * Every committed event still ahead, soonest first — the Overview's Coming up
 * card. The same `accepted`/`tentative` rule as the deadline above, so the
 * card's first row and the strip's calendar candidate are the same event.
 */
export function upcomingCommittedEvents(
  events: readonly CalendarEventSummary[],
  nowMs: number
): CommittedCalendarEvent[] {
  const upcoming: CommittedCalendarEvent[] = [];
  for (const event of events) {
    const response = event.event_response;
    if (response !== 'accepted' && response !== 'tentative') continue;
    const atMs = parseInstant(event.event_date);
    if (atMs === null || atMs <= nowMs) continue;
    upcoming.push({ eventId: event.event_id, atMs, title: event.title, response });
  }
  return upcoming.sort((a, b) => a.atMs - b.atMs);
}
