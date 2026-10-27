export interface MailHeaderSnapshot {
  mailId: number;
  /**
   * The header's `timestamp`, epoch ms — dates the feed row. Optional so a
   * baseline persisted before it existed still validates.
   */
  sentMs?: number;
  /**
   * The header's `from` character id. A mail the Character sent itself shows
   * up in the same list but is not "new mail". Optional so a baseline persisted
   * before it existed still validates.
   */
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
  /** When the mail was sent, when the header carried it. */
  sentMs?: number;
}

/**
 * Fires per mail id newly above the highest id seen in `prev` (issue #174).
 * ESI's mail list is capped at the 50 most recent (`getCharacterMailHeaders`),
 * and "load more" (`loadMoreMailHeaders`, features/character/mail.ts) can
 * write a longer merged list back to the same cache key this poller reads —
 * so a plain set-difference against `prev.entries` would treat every older
 * id newly paged in as "new mail" and flood on the next poll. `mail_id` is
 * monotonically increasing (it's what makes `last_mail_id` pagination work),
 * so gating on the high-water mark instead is immune to the window sliding
 * in either direction.
 */
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
    if (entry.fromId === characterId) continue; // outgoing, not incoming
    fires.push({
      eventId: 'newMail',
      characterId,
      mailId: entry.mailId,
      ...(entry.sentMs === undefined ? {} : { sentMs: entry.sentMs }),
    });
  }
  return fires;
}

/**
 * ESI's `event_response` values. Exported as a runtime array (rather than a
 * bare union type) so `pollDomains/`'s persisted-baseline validator can
 * check against the same literals instead of retyping them — a second typed
 * copy is exactly the drift a 5th ESI value would silently break.
 */
export const CALENDAR_EVENT_RESPONSES = [
  'declined',
  'not_responded',
  'accepted',
  'tentative',
] as const;

export interface CalendarEventEntrySnapshot {
  calendarEventId: number;
  /** Epoch ms this event starts (ESI's `event_date`). */
  startMs: number;
  /**
   * ESI's `title` — what the pilot actually named the thing.
   *
   * Optional because poller snapshots are persisted (`pollerState.ts`) and a
   * row written before this field existed is still a valid baseline; a diff
   * reading one must say less rather than refuse to fire. Every fresh snapshot
   * carries it.
   */
  title?: string;
  /**
   * ESI's `event_response`. Optional for the same reason `title` is — a
   * baseline persisted before this field existed must still work as a diff
   * source. Absence must default to notifying, not to silence: only a
   * confirmed `'declined'` suppresses the starting reminder.
   */
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
  /**
   * When the new event starts. Carried on the fire because "you were invited
   * to something" is not actionable without it — the whole question a pilot
   * has on being added to a calendar is whether they can make it.
   */
  startMs: number;
  /** Absent only for a snapshot written before the title was recorded. */
  title?: string;
}

export interface CalendarEventStartingFire {
  eventId: 'calendarEventStarting';
  characterId: number;
  calendarEventId: number;
  /** Absent only for a snapshot written before the title was recorded. */
  title?: string;
}

/**
 * Fires per calendar event id newly above the highest id seen in `prev`
 * (issue #174) — same high-water-mark reasoning as `diffNewMail`:
 * `getCharacterCalendar` returns only up to 50 events from now, so as events
 * pass and the window slides, an older event newly entering the list must
 * not be reported as new.
 */
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

/**
 * Fires per event whose `startMs` is newly in the past — edge-triggered the
 * same way as `diffIndustryJobComplete`, comparing the event's own fixed
 * start instant against `prev.nowMs` rather than matching identity against
 * `prev.entries` (issue #174). Fires up to one poll interval after the
 * event's actual start, not before or on every later poll.
 */
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
