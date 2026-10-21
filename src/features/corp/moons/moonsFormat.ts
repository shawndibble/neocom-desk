import { formatIsk } from '@/lib/isk';
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

/** "Sep 2026" from a period's first day. */
export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** A period label for a monthly or custom cadence. */
export function periodLabel(start: string, end: string): string {
  return start.slice(0, 7) === end.slice(0, 7) && start.endsWith('-01')
    ? monthLabel(start)
    : `${shortDate(start)} – ${shortDate(end)}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
