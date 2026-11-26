export type WeekStart = 'monday' | 'sunday';

export interface GridDay {
  date: Date;
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

export function startOfWeek(date: Date, weekStart: WeekStart = 'monday'): Date {
  const day = date.getDay();
  const startDay = weekStart === 'sunday' ? 0 : 1;
  const offset = (day - startDay + 7) % 7;
  return addDays(date, -offset);
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

export function buildMonthGrid(
  monthAnchor: Date,
  today: Date = new Date(),
  weekStart: WeekStart = 'monday'
): GridDay[] {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth, weekStart);
  return Array.from({ length: 42 }, (_, i) => toGridDay(addDays(gridStart, i), monthAnchor, today));
}

export function buildFortnightDays(
  anchor: Date,
  today: Date = new Date(),
  weekStart: WeekStart = 'monday'
): GridDay[] {
  const gridStart = startOfWeek(anchor, weekStart);
  return Array.from({ length: 14 }, (_, i) => toGridDay(addDays(gridStart, i), anchor, today));
}

export function buildDaysFrom(start: Date, count: number, today: Date = new Date()): GridDay[] {
  return Array.from({ length: count }, (_, i) => toGridDay(addDays(start, i), start, today));
}

export function weekdayLabels(weekStart: WeekStart = 'monday'): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const start = startOfWeek(new Date(2024, 0, 1), weekStart);
  return Array.from({ length: 7 }, (_, i) => formatter.format(addDays(start, i)));
}

export function formatMonthLabel(monthAnchor: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthAnchor);
}

export function formatFortnightLabel(anchor: Date, weekStart: WeekStart = 'monday'): string {
  return formatSpanLabel(startOfWeek(anchor, weekStart), 13);
}

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
