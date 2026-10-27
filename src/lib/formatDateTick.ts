/**
 * A bare `YYYY-MM-DD` date as a short label ("Oct 7"). Built from Y/M/D
 * components, never `new Date(string)`, so there is no UTC/local day shift.
 */
function format(date: string, withYear: boolean): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export const formatDateTick = (date: string): string => format(date, false);

/** The same label with the year, for a tooltip or table cell. */
export const formatDateWithYear = (date: string): string => format(date, true);

/** A bare `YYYY-MM-DD` day written the way the Wallet Journal writes its dates ("10/15/2026"). */
export function formatIsoDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}
