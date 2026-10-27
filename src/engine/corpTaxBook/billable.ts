/**
 * Day closing (epic #4055, "Day closing"): a UTC day becomes Billable only
 * once the day has ended, the grace (30 minutes by default, adjustable) has passed —
 * the refinery ledger lags real time on top of its 1h cache — and an officer
 * has synced after that, so the book holds the day's final quantities.
 */
import { shiftDate } from '../miningTax/yieldRange';
import { HOUR_MS } from '@/lib/age';

export const DEFAULT_GRACE_HOURS = 0.5;

export interface DayClosingClock {
  now: string;
  /** The book's last sync by any officer; absent when it was never synced. */
  lastSyncedAt?: string;
  graceHours?: number;
}

/** The instant `date` stops taking late ore: the end of the UTC day plus the grace. */
export function dayClosesAt(date: string, graceHours: number = DEFAULT_GRACE_HOURS): string {
  return new Date(
    Date.parse(`${shiftDate(date, 1)}T00:00:00Z`) + graceHours * HOUR_MS
  ).toISOString();
}

export function isDayBillable(date: string, clock: DayClosingClock): boolean {
  if (clock.lastSyncedAt === undefined) return false;
  const closes = Date.parse(dayClosesAt(date, clock.graceHours));
  return Date.parse(clock.now) >= closes && Date.parse(clock.lastSyncedAt) >= closes;
}

/** The latest Billable day — every day up to and including it is Billable — or undefined with no sync. */
export function lastBillableDate(clock: DayClosingClock): string | undefined {
  if (clock.lastSyncedAt === undefined) return undefined;
  const closedBy = Math.min(Date.parse(clock.now), Date.parse(clock.lastSyncedAt));
  const graceMs = (clock.graceHours ?? DEFAULT_GRACE_HOURS) * HOUR_MS;
  return shiftDate(new Date(closedBy - graceMs).toISOString().slice(0, 10), -1);
}
