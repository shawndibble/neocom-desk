/**
 * Local calendar days, shared by both deadline boards.
 *
 * Days are **calendar days, not rolling 24-hour windows**: a pilot reading
 * "Tuesday" means their own Tuesday. `localMidnight` reads the machine's zone
 * deliberately; `dayStart` and `nextDay` take the Time format clock (`DayZone`)
 * for boards that follow it.
 *
 * Implemented by zeroing a `Date`'s clock fields rather than by subtracting a
 * modulus: a `ms % 86_400_000` is an hour wrong for half the year on either
 * side of a DST change, and the error is invisible until someone's event files
 * under the wrong heading. Both boards had their own body for this before —
 * one rule, two implementations, and the DST prose duplicated with them.
 */
const DAY_MS = 86_400_000;

export function localMidnight(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The local midnight one calendar day after `dayStartMs`. DST-safe for the same reason. */
export function nextLocalDay(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

/**
 * The clock a calendar's days are cut on: `'UTC'` for EVE time, `undefined` for
 * the machine's own zone (the `timeZoneFor` value of `lib/timeFormat.ts`).
 */
export type DayZone = 'UTC' | undefined;

/**
 * Midnight starting the day that holds `ms`, on the given clock. `undefined`
 * is `localMidnight`; `'UTC'` is the EVE day, which has no DST to be wrong about.
 */
export function dayStart(ms: number, zone: DayZone): number {
  return zone === 'UTC' ? ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS) : localMidnight(ms);
}

/** The midnight one calendar day after `dayStartMs` on the given clock. */
export function nextDay(dayStartMs: number, zone: DayZone): number {
  return zone === 'UTC' ? dayStartMs + DAY_MS : nextLocalDay(dayStartMs);
}

/**
 * A grid cell's `Date` (local midnight carrying the day's calendar fields), as
 * the `dayStart` key of the day it stands for on the given clock. A grid draws
 * its cells from the calendar fields alone, so the same cell means the local
 * day on one clock and the EVE day on the other.
 */
export function cellDayStart(cell: Date, zone: DayZone): number {
  return zone === 'UTC'
    ? Date.UTC(cell.getFullYear(), cell.getMonth(), cell.getDate())
    : localMidnight(cell.getTime());
}

/** The calendar date `ms` falls on, on the given clock, as a grid cell's `Date`. */
export function cellOf(ms: number, zone: DayZone): Date {
  const d = new Date(ms);
  return zone === 'UTC'
    ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The UTC (EVE) calendar date of `ms`, as `YYYY-MM-DD`. Defaults to now. */
export function utcDay(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A `YYYY-MM-DD` UTC date shifted by `days` (negative = earlier). */
export function shiftUtcDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDay(Date.UTC(y!, m! - 1, d! + days));
}
