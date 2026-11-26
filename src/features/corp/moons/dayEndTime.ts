import { DEFAULT_GRACE_HOURS } from '@/engine/corpTaxBook/billable';

export function dayEndTime(graceHours: number): string {
  const grace = Number.isFinite(graceHours) ? graceHours : DEFAULT_GRACE_HOURS;
  const minutes = Math.round(grace * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
