/**
 * EVE time: UTC, which is the in-game clock. Pure; the caller passes `ms`.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" on the EVE (UTC) clock. */
export function eveClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "YYYY-MM-DD" on the EVE (UTC) calendar. */
export function eveDateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
