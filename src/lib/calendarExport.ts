import { MINUTE_MS } from '@/lib/age';

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

function toUtcBasic(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function endOf(event: CalendarExportEvent): Date {
  return new Date(event.start.getTime() + event.durationMinutes * MINUTE_MS);
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

const ICS_LINE_OCTETS = 75;
const encoder = new TextEncoder();

function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= ICS_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let used = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? ICS_LINE_OCTETS : ICS_LINE_OCTETS - 1;
    if (used + size > limit) {
      parts.push(current);
      current = '';
      used = 0;
    }
    current += char;
    used += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcsFile(event: CalendarExportEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neocom Desk//Calendar Export//EN',
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
  return lines.map(foldIcsLine).join('\r\n');
}

export function googleCalendarUrl(event: CalendarExportEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toUtcBasic(event.start)}/${toUtcBasic(endOf(event))}`,
  });
  if (event.description) params.set('details', event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
