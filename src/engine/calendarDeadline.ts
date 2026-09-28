/**
 * What the Overview's "Next deadline" strip draws from the calendar: the
 * soonest upcoming event the pilot has actually committed to.
 *
 * Only `accepted` and `tentative` responses qualify — a `declined` or
 * `not_responded` event is not a plan the pilot has made, so it must not
 * lead the board the way a real deadline does.
 */
import type { CalendarEventSummary } from '@/esi/endpoints';
import { parseInstant } from './esiInstant';

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
