import { describe, it, expect } from 'vitest';
import type { CalendarEventSummary } from '@/esi/endpoints';
import { calendarCsvColumns, calendarExportEvents } from './calendarCsv';
import { localMidnight } from '@/engine/localDay';

const t = (k: string) => k;

function event(overrides: Partial<CalendarEventSummary> = {}): CalendarEventSummary {
  return {
    event_id: 1,
    event_date: '2026-08-29T18:00:00Z',
    title: 'Fleet op',
    importance: 1,
    event_response: 'accepted',
    ...overrides,
  };
}

describe('calendarCsvColumns', () => {
  it('orders columns date, title, response', () => {
    const columns = calendarCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'calendar.csvDate',
      'calendar.csvTitle',
      'calendar.csvResponse',
    ]);
  });

  it('passes event_date through unchanged as a raw ISO string', () => {
    const columns = calendarCsvColumns(t);
    const dateColumn = columns.find((c) => c.header === 'calendar.csvDate')!;
    expect(dateColumn.value(event({ event_date: '2026-09-01T00:00:00Z' }))).toBe(
      '2026-09-01T00:00:00Z'
    );
  });

  it('routes response through the same RESPONSE_KEY translations as the list view', () => {
    const columns = calendarCsvColumns(t);
    const responseColumn = columns.find((c) => c.header === 'calendar.csvResponse')!;
    expect(responseColumn.value(event({ event_response: 'declined' }))).toBe(
      'calendar.responseDeclined'
    );
    expect(responseColumn.value(event({ event_response: 'not_responded' }))).toBe(
      'calendar.responseNotResponded'
    );
  });
});

describe('calendarExportEvents', () => {
  const day = new Date(2026, 8, 1, 12).getTime();
  const nextDay = new Date(2026, 8, 2, 12).getTime();
  const onDay = event({ event_id: 1, event_date: new Date(day).toISOString() });
  const onNextDay = event({ event_id: 2, event_date: new Date(nextDay).toISOString() });

  it('exports nothing while the calendar-event kind is hidden', () => {
    expect(calendarExportEvents([onDay, onNextDay], ['calendarEvent'], null)).toEqual([]);
  });

  it('keeps events when only other kinds are hidden', () => {
    expect(calendarExportEvents([onDay], ['industryJob'], null)).toEqual([onDay]);
  });

  it('exports every event when no day is selected', () => {
    expect(calendarExportEvents([onDay, onNextDay], [], null)).toEqual([onDay, onNextDay]);
  });

  it('exports only the selected local day', () => {
    expect(calendarExportEvents([onDay, onNextDay], [], localMidnight(day))).toEqual([onDay]);
  });
});
