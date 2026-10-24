import { formatIsk } from '@/lib/isk';
import { verifyPeriodLabel } from '@/features/corpTaxBook/verifyPeriodLabel';
import { MONTHS } from '@/engine/corpTaxBook/monthNames';

export const isk = (value: number) => formatIsk(Math.round(value));

/** A refinery shown before (or without) its name: a placeholder, never written as one. */
export const refineryPlaceholder = (id: number | string) => `Refinery ${id}`;

/** "18 Oct" from a UTC date or instant. */
export function shortDate(value: string): string {
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "18 Oct 14:00" from an instant (EVE time is UTC). */
export function shortDateTime(value: string): string {
  return `${shortDate(value)} ${value.slice(11, 16)}`;
}

/** A period label: "Oct 2026" only for a whole calendar month, else the days it covers. */
export function periodLabel(start: string, end: string): string {
  return verifyPeriodLabel(start, end, 'en');
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
