const OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

export function formatLocalDate(date: Date, timeZone?: string): string {
  return date.toLocaleDateString('en-CA', timeZone ? { ...OPTIONS, timeZone } : OPTIONS);
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...OPTIONS,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

export function formatLocalDateTime(date: Date, timeZone?: string): string {
  if (timeZone === undefined) return date.toLocaleString('en-CA', DATE_TIME_OPTIONS);
  return date.toLocaleString('en-CA', {
    ...DATE_TIME_OPTIONS,
    hour12: undefined,
    hourCycle: 'h23',
    timeZone,
  });
}
