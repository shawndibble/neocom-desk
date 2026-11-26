import { DAY_MS } from '@/lib/age';

export function formatEveDateTime(date: Date): string {
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

const EVE_CLOCK = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function eveClock(ms: number): string {
  return EVE_CLOCK.format(new Date(ms)).replace(',', '');
}

const EVE_TIME_OF_DAY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function eveTimeOfDay(ms: number): string {
  return EVE_TIME_OF_DAY.format(new Date(ms));
}

const WEEK_MS = 7 * DAY_MS;

export function eveWhen(ms: number, nowMs: number): string {
  return ms - nowMs < WEEK_MS ? eveClock(ms) : formatEveDateTime(new Date(ms));
}
