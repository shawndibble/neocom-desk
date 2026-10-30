import { DAY_MS } from '@/lib/age';
/**
 * EVE time is UTC — the clock every player, timer and killmail in New Eden
 * runs on. A job's end shown in the viewer's own zone would be the one number
 * on the page they cannot read back to the game client.
 */

/** An instant as EVE time, `MM-DD HH:MM`. */
export function formatEveDateTime(date: Date): string {
  // Sliced off the ISO string rather than formatted: `Intl` would resolve
  // month names and the hour cycle per host, and this needs neither.
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

const EVE_CLOCK = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "Wed 02:00": EVE time is UTC, and a pilot plans a login against it, not their own zone. */
export function eveClock(ms: number): string {
  return EVE_CLOCK.format(new Date(ms)).replace(',', '');
}

const EVE_TIME_OF_DAY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "14:02": EVE time as a 24-hour time of day, no weekday. */
export function eveTimeOfDay(ms: number): string {
  return EVE_TIME_OF_DAY.format(new Date(ms));
}

const WEEK_MS = 7 * DAY_MS;

/** `eveClock` while the weekday is unambiguous (under a week out), else `formatEveDateTime`'s "10-23 14:20". */
export function eveWhen(ms: number, nowMs: number): string {
  return ms - nowMs < WEEK_MS ? eveClock(ms) : formatEveDateTime(new Date(ms));
}
