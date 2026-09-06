/**
 * Viewer-locale timestamp rendering, seconds omitted everywhere.
 *
 * `Date.toLocaleString()` with no options renders seconds ("9/6/2026,
 * 2:30:45 PM"). A second's precision is never actionable in any surface this
 * app has — jobs, contracts, wallet rows and notifications are all read to the
 * minute — and the extra glyphs cost horizontal room in dense tables. Sorting
 * is unaffected: every sortable column declares its own `sortValue` over the
 * underlying instant, never over the rendered string.
 *
 * No cached formatter, so the host timezone re-resolves per call —
 * load-bearing for tests that toggle `process.env.TZ` mid-run.
 *
 * Distinct from `lib/localDate.ts`, which pins en-CA so two Skills Planner
 * surfaces can never disagree by a day. These render in the viewer's locale.
 */

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** Local date and time, no seconds — the drop-in for a bare `toLocaleString()`. */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, TIMESTAMP_OPTIONS);
}

const CALENDAR_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * Calendar event rows: month abbreviation, day, local time. No year — calendar
 * events are near-term, so the year is noise in a row that has to stay narrow.
 */
export function formatCalendarTimestamp(date: Date): string {
  return date.toLocaleString(undefined, CALENDAR_OPTIONS);
}

/**
 * `hour: '2-digit'` where the other formatters use `'numeric'`: this one
 * prefixes events in the week grid's narrow day columns, where a one-digit
 * hour would break the vertical alignment of the times down a column.
 */
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Time of day alone, for rows already grouped under a date column. */
export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString(undefined, TIME_OPTIONS);
}
