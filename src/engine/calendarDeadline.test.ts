import { describe, it, expect } from 'vitest';
import { soonestCalendarDeadline } from './calendarDeadline';
import type { CalendarEventSummary } from '@/esi/endpoints';

const NOW = Date.parse('2026-01-01T00:00:00Z');

function event(overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary {
  return {
    event_id: 1,
    event_date: new Date(NOW + 3_600_000).toISOString(),
    title: 'Fleet op',
    importance: 0,
    event_response: 'accepted',
    ...overrides,
  };
}

describe('soonestCalendarDeadline', () => {
  it('picks the soonest accepted or tentative event', () => {
    const events = [
      event({ event_id: 1, event_date: new Date(NOW + 7_200_000).toISOString() }),
      event({
        event_id: 2,
        event_date: new Date(NOW + 3_600_000).toISOString(),
        event_response: 'tentative',
      }),
    ];
    const result = soonestCalendarDeadline(events, NOW);
    expect(result?.eventId).toBe(2);
  });

  it('excludes declined and not-responded events', () => {
    const events = [
      event({ event_id: 1, event_response: 'declined' }),
      event({ event_id: 2, event_response: 'not_responded' }),
    ];
    expect(soonestCalendarDeadline(events, NOW)).toBeNull();
  });

  it('excludes events that have already started', () => {
    const events = [event({ event_date: new Date(NOW - 3_600_000).toISOString() })];
    expect(soonestCalendarDeadline(events, NOW)).toBeNull();
  });

  it('drops an event whose date will not parse', () => {
    const events = [event({ event_date: 'not-a-date' })];
    expect(soonestCalendarDeadline(events, NOW)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(soonestCalendarDeadline([], NOW)).toBeNull();
  });
});
