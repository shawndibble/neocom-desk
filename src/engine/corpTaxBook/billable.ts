import { shiftDate } from '../miningTax/yieldRange';
import { HOUR_MS } from '@/lib/age';
import { utcDay } from '@/engine/localDay';

export const DEFAULT_GRACE_HOURS = 0.5;

export interface DayClosingClock {
  now: string;
  lastSyncedAt?: string;
  graceHours?: number;
}

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

export function lastBillableDate(clock: DayClosingClock): string | undefined {
  if (clock.lastSyncedAt === undefined) return undefined;
  const closedBy = Math.min(Date.parse(clock.now), Date.parse(clock.lastSyncedAt));
  const graceMs = (clock.graceHours ?? DEFAULT_GRACE_HOURS) * HOUR_MS;
  return shiftDate(utcDay(closedBy - graceMs), -1);
}
