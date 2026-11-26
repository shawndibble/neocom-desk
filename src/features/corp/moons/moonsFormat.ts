import { formatIsk } from '@/lib/isk';
import { MONTHS } from '@/engine/corpTaxBook/monthNames';
import { extractionWindowDays } from '@/engine/corpTaxBook/extractionWindow';
import type { TFunction } from 'i18next';
import { utcDay } from '@/engine/localDay';

export const isk = (value: number) => formatIsk(Math.round(value));

export const iskOrDash = (value: number) => (Math.abs(value) < 1 ? '—' : isk(value));

export const refineryPlaceholder = (id: number | string) => `Refinery ${id}`;

export const refineryUnreadable = (id: number | string) => `Unknown/Undockable (${id})`;

export const isRefineryPlaceholder = (name: string, id: number | string) =>
  name === refineryPlaceholder(id) || name === refineryUnreadable(id);

export function shortDate(value: string): string {
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function dateWithYear(value: string, now: Date = new Date()): string {
  const year = Number(value.slice(0, 4));
  return year === now.getUTCFullYear() ? shortDate(value) : `${shortDate(value)} ${year}`;
}

export type ClockZone = 'UTC' | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

export function wallClock(value: string | number, zone: ClockZone): string {
  const d = new Date(value);
  if (zone === 'UTC') return d.toISOString().slice(0, 16);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const atDate = (value: string | number, zone: ClockZone) =>
  shortDate(wallClock(value, zone));

export function atDateWithYear(
  value: string | number,
  zone: ClockZone,
  now: Date = new Date()
): string {
  const at = wallClock(value, zone);
  const year = at.slice(0, 4);
  return year === wallClock(now.getTime(), zone).slice(0, 4)
    ? shortDate(at)
    : `${shortDate(at)} ${year}`;
}

export const atTime = (value: string | number, zone: ClockZone) =>
  wallClock(value, zone).slice(11, 16);

const utcMark = (zone: ClockZone) => (zone === 'UTC' ? '\u00a0UTC' : '');

export function dateTimeAt(
  value: string | number,
  zone: ClockZone,
  now: Date = new Date()
): string {
  return `${atDateWithYear(value, zone, now)} ${atTime(value, zone)}${utcMark(zone)}`;
}

export function clockAt(ms: string | number, zone: ClockZone): string {
  return `${atTime(ms, zone)}${utcMark(zone)}`;
}

export function signedIsk(value: number): string {
  return `${value < 0 ? '\u2212' : '+'}${isk(Math.abs(value))}`;
}

export function shortDateTime(value: string | number, zone: ClockZone): string {
  return `${atDate(value, zone)} ${atTime(value, zone)}`;
}

export function extractionWindowLabel(
  t: TFunction,
  row: { startedAt: string; chunkArrivalAt: string },
  zone: ClockZone
): string {
  const days = extractionWindowDays(row.startedAt, row.chunkArrivalAt);
  const span = t('corpTaxBook.moons.windowDays', { count: days }).replace(/ /g, '\u00a0');
  return `${atDateWithYear(row.startedAt, zone)} \u2013 ${atDateWithYear(row.chunkArrivalAt, zone)} (${span})`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDay(Date.UTC(y, m - 1, d + days));
}

export function paidAtFor(date: string, now: Date = new Date()): string {
  return date === utcDay(now.getTime()) ? now.toISOString() : `${date}T12:00:00.000Z`;
}

export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
