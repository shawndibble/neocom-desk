export interface MailHeaderSnapshot {
  mailId: number;
  sentMs?: number;
  fromId?: number;
}

export interface MailSnapshot {
  entries: readonly MailHeaderSnapshot[];
  nowMs: number;
}

export interface MailNotificationFire {
  eventId: 'newMail';
  characterId: number;
  mailId: number;
  sentMs?: number;
}

export function diffNewMail(
  characterId: number,
  prev: MailSnapshot | undefined,
  next: MailSnapshot
): MailNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.mailId), 0);
  const fires: MailNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.mailId <= maxPrevId) continue;
    if (entry.fromId === characterId) continue;
    fires.push({
      eventId: 'newMail',
      characterId,
      mailId: entry.mailId,
      ...(entry.sentMs === undefined ? {} : { sentMs: entry.sentMs }),
    });
  }
  return fires;
}

export const CALENDAR_EVENT_RESPONSES = [
  'declined',
  'not_responded',
  'accepted',
  'tentative',
] as const;

export interface CalendarEventEntrySnapshot {
  calendarEventId: number;
  startMs: number;
  title?: string;
  response?: (typeof CALENDAR_EVENT_RESPONSES)[number];
}

export interface CalendarSnapshot {
  entries: readonly CalendarEventEntrySnapshot[];
  nowMs: number;
}

export interface NewCalendarEventFire {
  eventId: 'newCalendarEvent';
  characterId: number;
  calendarEventId: number;
  startMs: number;
  title?: string;
}

export interface CalendarEventStartingFire {
  eventId: 'calendarEventStarting';
  characterId: number;
  calendarEventId: number;
  title?: string;
}

export function diffNewCalendarEvent(
  characterId: number,
  prev: CalendarSnapshot | undefined,
  next: CalendarSnapshot
): NewCalendarEventFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.calendarEventId), 0);
  const fires: NewCalendarEventFire[] = [];
  for (const entry of next.entries) {
    if (entry.calendarEventId <= maxPrevId) continue;
    fires.push({
      eventId: 'newCalendarEvent',
      characterId,
      calendarEventId: entry.calendarEventId,
      startMs: entry.startMs,
      ...(entry.title === undefined ? {} : { title: entry.title }),
    });
  }
  return fires;
}

export function diffCalendarEventStarting(
  characterId: number,
  prev: CalendarSnapshot | undefined,
  next: CalendarSnapshot
): CalendarEventStartingFire[] {
  if (!prev) return [];
  const fires: CalendarEventStartingFire[] = [];
  for (const entry of next.entries) {
    if (entry.response === 'declined') continue;
    if (entry.startMs > next.nowMs) continue;
    if (entry.startMs <= prev.nowMs) continue;
    fires.push({
      eventId: 'calendarEventStarting',
      characterId,
      calendarEventId: entry.calendarEventId,
      ...(entry.title === undefined ? {} : { title: entry.title }),
    });
  }
  return fires;
}
