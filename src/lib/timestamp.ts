function clockFor(timeZone: string | undefined): Intl.DateTimeFormatOptions {
  return timeZone === 'UTC' ? { hourCycle: 'h23' } : {};
}

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function formatTimestamp(date: Date, timeZone?: string): string {
  return date.toLocaleString(undefined, { ...TIMESTAMP_OPTIONS, ...clockFor(timeZone), timeZone });
}

const DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
};

export function formatDateOnly(date: Date, timeZone?: string): string {
  return date.toLocaleDateString(undefined, { ...DATE_ONLY_OPTIONS, timeZone });
}

const CALENDAR_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

export function formatCalendarTimestamp(date: Date, timeZone?: string): string {
  return date.toLocaleString(undefined, { ...CALENDAR_OPTIONS, ...clockFor(timeZone), timeZone });
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export function formatTimeOfDay(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString(undefined, { ...TIME_OPTIONS, ...clockFor(timeZone), timeZone });
}

export function splitTimestamp(date: Date, timeZone?: string): { date: string; time: string } {
  const full = formatTimestamp(date, timeZone);
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...clockFor(timeZone),
    timeZone,
  });
  if (!time || !full.endsWith(time)) return { date: full, time: '' };
  return { date: full.slice(0, full.length - time.length), time };
}
