import { DEFAULT_GRACE_HOURS } from '@/engine/corpTaxBook/billable';

/** When a UTC day stops taking late ore, as HH:MM EVE time: 00:00 plus the book's grace. */
export function dayEndTime(graceHours: number): string {
  const grace = Number.isFinite(graceHours) ? graceHours : DEFAULT_GRACE_HOURS;
  const minutes = Math.round(grace * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
