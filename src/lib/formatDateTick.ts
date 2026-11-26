function format(date: string, withYear: boolean): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export const formatDateTick = (date: string): string => format(date, false);

export const formatDateWithYear = (date: string): string => format(date, true);

export function formatIsoDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}
