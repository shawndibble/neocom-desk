/**
 * Client-side "add to Google/Outlook calendar" export (issue #416): a plain
 * `.ics` file plus a Google Calendar prefilled-event URL, both generated from
 * fields the app already has (no new backend or dependency). ESI's Calendar
 * Event carries no location field, so neither output includes one — pure, no
 * fetch/DOM/Dexie imports.
 */

export interface CalendarExportEvent {
  eventId: number;
  title: string;
  start: Date;
  durationMinutes: number;
  description?: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYYMMDDTHHMMSSZ`, the basic UTC format both ICS and Google Calendar's URL scheme use. */
function toUtcBasic(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function endOf(event: CalendarExportEvent): Date {
  return new Date(event.start.getTime() + event.durationMinutes * 60_000);
}

/** RFC 5545 §3.3.11 text escaping: backslash first, then the characters it introduces. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

/**
 * A single-event `.ics` file. `now` (default: wall clock) is injectable so a
 * test can pin `DTSTAMP` instead of freezing the clock — the same pattern
 * `downloadCsv`'s `now` param uses.
 */
export function buildIcsFile(event: CalendarExportEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NeoCom Desk//Calendar Export//EN',
    'BEGIN:VEVENT',
    `UID:${event.eventId}@neocom-desk`,
    `DTSTAMP:${toUtcBasic(now)}`,
    `DTSTART:${toUtcBasic(event.start)}`,
    `DTEND:${toUtcBasic(endOf(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** Google Calendar's documented prefilled-event URL scheme — also opens directly in Outlook.com/most calendar apps via "subscribe from URL" fallback flows, so one URL covers the ticket's "Google/Outlook" ask without a second code path. */
export function googleCalendarUrl(event: CalendarExportEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcBasic(event.start)}/${toUtcBasic(endOf(event))}`,
  });
  if (event.description) params.set('details', event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
