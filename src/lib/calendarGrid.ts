/**
 * Pure date-grid math for the Calendar's Month/Week views. Local time
 * throughout, matching `lib/timestamp.ts`'s display of ESI's UTC event
 * timestamps — no fetch/DOM/Dexie imports.
 */

export interface GridDay {
  /** Local midnight for this day. */
  date: Date;
  /** Local 'YYYY-MM-DD'. */
  key: string;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, delta: number): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + delta);
  return result;
}

export function addWeeks(date: Date, delta: number): Date {
  return addDays(date, delta * 7);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, date.getDate());
}

/** Rewinds to the Monday of the anchor's week. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday .. 6 = Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(date, mondayOffset);
}

function toGridDay(date: Date, monthAnchor: Date, today: Date): GridDay {
  return {
    date,
    key: dayKey(date),
    inCurrentMonth:
      date.getMonth() === monthAnchor.getMonth() &&
      date.getFullYear() === monthAnchor.getFullYear(),
    isToday: isSameDay(date, today),
  };
}

/** 42 cells (6 Monday-first weeks) covering the anchor's month, plus lead/trail days. */
export function buildMonthGrid(monthAnchor: Date, today: Date = new Date()): GridDay[] {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => toGridDay(addDays(gridStart, i), monthAnchor, today));
}

/**
 * 14 Monday-first days containing the anchor — the Calendar Map's Fortnight
 * density.
 *
 * Its own builder rather than a span argument on `buildMonthGrid`: that one is
 * a fixed 42 cells aligned to a month, and a caller asking for 14 wants two
 * whole weeks around a date instead, which is a different question about a
 * different anchor.
 */
export function buildFortnightDays(anchor: Date, today: Date = new Date()): GridDay[] {
  const gridStart = startOfWeek(anchor);
  return Array.from({ length: 14 }, (_, i) => toGridDay(addDays(gridStart, i), anchor, today));
}

/** Monday..Sunday short weekday names, in the viewer's locale. */
export function weekdayLabels(): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  // 2024-01-01 is a Monday — an arbitrary fixed anchor, not tied to "today".
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => formatter.format(addDays(monday, i)));
}

export function formatMonthLabel(monthAnchor: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthAnchor);
}

/**
 * The 14-day span `buildFortnightDays` draws, as a label.
 *
 * Its own function because `formatWeekLabel` spans six days from the Monday
 * and would print a seven-day range over a fourteen-day grid — a caption
 * quietly disagreeing with the thing it captions.
 */
export function formatFortnightLabel(anchor: Date): string {
  return formatSpanLabel(startOfWeek(anchor), 13);
}

/** Shared by the week and fortnight labels: a start date, and how many days after it. */
function formatSpanLabel(start: Date, spanDays: number): string {
  const end = addDays(start, spanDays);
  const dayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const yearFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric' });
  const startLabel =
    start.getFullYear() === end.getFullYear()
      ? dayFormatter.format(start)
      : `${dayFormatter.format(start)}, ${yearFormatter.format(start)}`;
  return `${startLabel} – ${dayFormatter.format(end)}, ${yearFormatter.format(end)}`;
}

/**
 * Parses a native `<input type="date">` value ("YYYY-MM-DD") as local
 * midnight, matching every other date in this module — never as a UTC
 * instant, which would shift the day in a timezone behind UTC. `null` for
 * anything the input contract doesn't actually produce (empty, malformed).
 */
