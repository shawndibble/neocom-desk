import { formatIsk } from '@/lib/isk';
import { verifyPeriodLabel } from '@/features/corpTaxBook/verifyPeriodLabel';
import { MONTHS } from '@/engine/corpTaxBook/monthNames';
import { extractionWindowDays } from '@/engine/corpTaxBook/extractionWindow';
import type { TFunction } from 'i18next';

export const isk = (value: number) => formatIsk(Math.round(value));

/** A whole-ISK figure, or a dash when it is nothing (under 1 ISK): a zero is not a number worth printing. */
export const iskOrDash = (value: number) => (Math.abs(value) < 1 ? '—' : isk(value));

/** A refinery shown before (or without) its name: a placeholder, never written as one. */
export const refineryPlaceholder = (id: number | string) => `Refinery ${id}`;

/** "18 Oct" from a UTC date or instant. */
export function shortDate(value: string): string {
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "18 Oct", or "18 Oct 2025" when the year is not `now`'s: a date that could be read as this year's. */
export function dateWithYear(value: string, now: Date = new Date()): string {
  const year = Number(value.slice(0, 4));
  return year === now.getUTCFullYear() ? shortDate(value) : `${shortDate(value)} ${year}`;
}

/** "18 Oct 14:00 UTC" (EVE time) from an instant, with the year when it is not this one. */
export function dateTimeUtc(value: string, now: Date = new Date()): string {
  return `${dateWithYear(value, now)} ${value.slice(11, 16)}\u00a0UTC`;
}

/** An amount with its direction in the sign, U+2212 for a minus (the book's sums use it too). */
export function signedIsk(value: number): string {
  return `${value < 0 ? '\u2212' : '+'}${isk(Math.abs(value))}`;
}

/** "18 Oct 14:00" from an instant (EVE time is UTC). */
export function shortDateTime(value: string): string {
  return `${shortDate(value)} ${value.slice(11, 16)}`;
}

/** "18 Oct - 24 Oct (6 days)": an Extraction's start to its chunk arriving. */
export function extractionWindowLabel(
  t: TFunction,
  row: { startedAt: string; chunkArrivalAt: string }
): string {
  const days = extractionWindowDays(row.startedAt, row.chunkArrivalAt);
  // The days stay on one line: a break inside "(41 days)" leaves the "41" hanging.
  const span = t('corpTaxBook.moons.windowDays', { count: days }).replace(/ /g, '\u00a0');
  return `${dateWithYear(row.startedAt)} - ${dateWithYear(row.chunkArrivalAt)} (${span})`;
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
