import { describe, it, expect } from 'vitest';
import { buildIcsFile, googleCalendarUrl, type CalendarExportEvent } from './calendarExport';

const EVENT: CalendarExportEvent = {
  eventId: 123456,
  title: 'Fleet Op',
  start: new Date(Date.UTC(2026, 8, 3, 20, 0, 0)),
  durationMinutes: 90,
  description: 'Bring T2 fits.',
};

describe('buildIcsFile', () => {
  it('emits a well-formed VCALENDAR/VEVENT with UTC start/end and a stable UID', () => {
    const ics = buildIcsFile(EVENT, new Date(Date.UTC(2026, 8, 1, 0, 0, 0)));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:123456@neocom-desk');
    expect(ics).toContain('DTSTAMP:20260901T000000Z');
    expect(ics).toContain('DTSTART:20260903T200000Z');
    // 90 minutes after 20:00 = 21:30.
    expect(ics).toContain('DTEND:20260903T213000Z');
    expect(ics).toContain('SUMMARY:Fleet Op');
    expect(ics).toContain('DESCRIPTION:Bring T2 fits.');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('escapes commas, semicolons, and newlines per RFC 5545', () => {
    const ics = buildIcsFile({
      ...EVENT,
      title: 'Fleet, Op; Alpha',
      description: 'Line one\nLine two',
    });
    expect(ics).toContain('SUMMARY:Fleet\\, Op\\; Alpha');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('omits the DESCRIPTION line entirely when there is no description', () => {
    const ics = buildIcsFile({ ...EVENT, description: undefined });
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('uses CRLF line endings (the format ICS readers expect)', () => {
    const ics = buildIcsFile(EVENT);
    expect(ics).toContain('\r\n');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a prefilled-event URL with UTC start/end and the title/description', () => {
    const url = googleCalendarUrl(EVENT);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe('Fleet Op');
    expect(parsed.searchParams.get('dates')).toBe('20260903T200000Z/20260903T213000Z');
    expect(parsed.searchParams.get('details')).toBe('Bring T2 fits.');
  });

  it('omits the details param when there is no description', () => {
    const url = googleCalendarUrl({ ...EVENT, description: undefined });
    expect(new URL(url).searchParams.has('details')).toBe(false);
  });
});
