/**
 * Numeric-only options: no ICU string data (month/weekday names) to drift
 * between a developer machine and the Linux CI runner. A new
 * `Intl.DateTimeFormat` per call (not cached) so it re-resolves the host
 * timezone on every call — load-bearing for tests that toggle `process.env.TZ`
 * mid-run.
 */
const OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

/**
 * Renders an instant as the viewer's local calendar date (YYYY-MM-DD). Used
 * by every Skills Planner date surface (plan header, entries panel header,
 * step timeline, remap-cooldown) so two surfaces showing the same instant
 * can never disagree by a day — see #207.
 */
export function formatLocalDate(date: Date): string {
  return date.toLocaleDateString('en-CA', OPTIONS);
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...OPTIONS,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

/**
 * Renders an instant as the viewer's local date *and* time (YYYY-MM-DD, HH:MM).
 * A structure's reinforcement timer (issue #300) is only actionable to the
 * minute — a date alone would leave a director guessing which fifteen-minute
 * window to be in space for — but every other constraint from `formatLocalDate`
 * still applies, so this shares its numeric-only, per-call-formatter shape.
 */
export function formatLocalDateTime(date: Date): string {
  return date.toLocaleString('en-CA', DATE_TIME_OPTIONS);
}
