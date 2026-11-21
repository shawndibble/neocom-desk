import { formatIsk } from '@/lib/isk';
import { verifyPeriodLabel } from '@/features/corpTaxBook/verifyPeriodLabel';
import { MONTHS } from '@/engine/corpTaxBook/monthNames';
import { extractionWindowDays } from '@/engine/corpTaxBook/extractionWindow';
import type { TFunction } from 'i18next';
import { utcDay } from '@/engine/localDay';

export const isk = (value: number) => formatIsk(Math.round(value));

/** A whole-ISK figure, or a dash when it is nothing (under 1 ISK): a zero is not a number worth printing. */
export const iskOrDash = (value: number) => (Math.abs(value) < 1 ? '—' : isk(value));

/** A refinery shown before (or without) its name: a placeholder, never written as one. */
export const refineryPlaceholder = (id: number | string) => `Refinery ${id}`;

/**
 * A refinery whose name lookups have finished and found nothing: ESI names a
 * structure only to a character with docking access. The id stays so two such
 * refineries never read alike.
 */
export const refineryUnreadable = (id: number | string) => `Unknown/Undockable (${id})`;

/** Either stand-in, so neither is ever saved or mailed as if it were the structure's real name. */
export const isRefineryPlaceholder = (name: string, id: number | string) =>
  name === refineryPlaceholder(id) || name === refineryUnreadable(id);

/** "18 Oct" from a UTC date or instant. */
export function shortDate(value: string): string {
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Oct 2026" from a `YYYY-MM` month (or any date in it). */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "18 Oct", or "18 Oct 2025" when the year is not `now`'s: a date that could be read as this year's. */
export function dateWithYear(value: string, now: Date = new Date()): string {
  const year = Number(value.slice(0, 4));
  return year === now.getUTCFullYear() ? shortDate(value) : `${shortDate(value)} ${year}`;
}

/**
 * The Time format preference's zone (`useTimeZone()`): `'UTC'` for EVE time,
 * `undefined` for the viewer's own clock.
 */
export type ClockZone = 'UTC' | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * An instant as `YYYY-MM-DDTHH:MM` on `zone`'s wall clock, for the slice-based
 * labels below. Only instants go through here: a `YYYY-MM-DD` ledger day is an
 * EVE day whatever the clock, and keeps `shortDate` / `dateWithYear`.
 */
export function wallClock(value: string | number, zone: ClockZone): string {
  const d = new Date(value);
  if (zone === 'UTC') return d.toISOString().slice(0, 16);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "18 Oct" from an instant, on the Time format's clock. */
export const atDate = (value: string | number, zone: ClockZone) =>
  shortDate(wallClock(value, zone));

/** "18 Oct", or "18 Oct 2025" off this year, from an instant on the Time format's clock. */
export const atDateWithYear = (value: string | number, zone: ClockZone, now: Date = new Date()) =>
  dateWithYear(wallClock(value, zone), now);

/** "14:00" from an instant on the Time format's clock. */
export const atTime = (value: string | number, zone: ClockZone) =>
  wallClock(value, zone).slice(11, 16);

const utcMark = (zone: ClockZone) => (zone === 'UTC' ? '\u00a0UTC' : '');

/** "18 Oct 14:00 UTC" (EVE time) or "18 Oct 16:00" (local), with the year when it is not this one. */
export function dateTimeAt(value: string, zone: ClockZone, now: Date = new Date()): string {
  return `${atDateWithYear(value, zone, now)} ${atTime(value, zone)}${utcMark(zone)}`;
}

/** "12:35 UTC" or "14:35" from an instant: a time later today or tomorrow, where the date adds nothing. */
export function clockAt(ms: number, zone: ClockZone): string {
  return `${atTime(ms, zone)}${utcMark(zone)}`;
}

/** An amount with its direction in the sign, U+2212 for a minus (the book's sums use it too). */
export function signedIsk(value: number): string {
  return `${value < 0 ? '\u2212' : '+'}${isk(Math.abs(value))}`;
}

/** "18 Oct 14:00" from an instant, on the Time format's clock. */
export function shortDateTime(value: string, zone: ClockZone): string {
  return `${atDate(value, zone)} ${atTime(value, zone)}`;
}

/** "18 Oct - 24 Oct (6 days)": an Extraction's start to its chunk arriving. */
export function extractionWindowLabel(
  t: TFunction,
  row: { startedAt: string; chunkArrivalAt: string },
  zone: ClockZone
): string {
  const days = extractionWindowDays(row.startedAt, row.chunkArrivalAt);
  // The days stay on one line: a break inside "(41 days)" leaves the "41" hanging.
  const span = t('corpTaxBook.moons.windowDays', { count: days }).replace(/ /g, '\u00a0');
  return `${atDateWithYear(row.startedAt, zone)} \u2013 ${atDateWithYear(row.chunkArrivalAt, zone)} (${span})`;
}

/** A period label: "Oct 2026" only for a whole calendar month, else the days it covers. */
export function periodLabel(start: string, end: string): string {
  return verifyPeriodLabel(start, end, 'en');
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDay(Date.UTC(y, m - 1, d + days));
}

/** A `YYYY-MM-DD` paid date as the instant the book stores: now for today, else noon EVE time that day. */
export function paidAtFor(date: string, now: Date = new Date()): string {
  return date === utcDay(now.getTime()) ? now.toISOString() : `${date}T12:00:00.000Z`;
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
