import { DAY_MS } from '@/lib/age';
import { utcDay, utcDayOf } from '../../functions/src/timeConstants';

export function localMidnight(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function nextLocalDay(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

export type DayZone = 'UTC' | undefined;

export function dayStart(ms: number, zone: DayZone): number {
  return zone === 'UTC' ? ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS) : localMidnight(ms);
}

export function nextDay(dayStartMs: number, zone: DayZone): number {
  return zone === 'UTC' ? dayStartMs + DAY_MS : nextLocalDay(dayStartMs);
}

export function cellDayStart(cell: Date, zone: DayZone): number {
  return zone === 'UTC'
    ? Date.UTC(cell.getFullYear(), cell.getMonth(), cell.getDate())
    : localMidnight(cell.getTime());
}

export function cellOf(ms: number, zone: DayZone): Date {
  const d = new Date(ms);
  return zone === 'UTC'
    ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export { utcDay, utcDayOf };

export function shiftUtcDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDay(Date.UTC(y!, m! - 1, d! + days));
}

export function utcDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
