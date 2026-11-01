/**
 * `<input type="datetime-local">` values as instants, in the viewer's Time
 * format (`timeZoneFor`): EVE time reads the value as UTC, the default as the
 * browser's own zone. The input has no zone of its own, so the caller must say.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` for `ms`, in `timeZone` (`'UTC'`, else the browser's zone). */
export function instantToInputValue(ms: number, timeZone: 'UTC' | undefined): string {
  const date = new Date(ms);
  if (timeZone === 'UTC') return date.toISOString().slice(0, 16);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** The instant a `datetime-local` value names in `timeZone`, or null when it is not a full date and time. */
export function inputValueToInstant(value: string, timeZone: 'UTC' | undefined): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = timeZone === 'UTC' ? Date.parse(`${value}:00Z`) : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
