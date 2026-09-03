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
