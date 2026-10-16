/**
 * The phone Journal's day groups: one per EVE (UTC) day, with a net that
 * leaves out transfers between your own Characters (they move ISK, not earn
 * or spend it). Pure, so the grouping and the net test without rendering.
 */
import type { JournalRow } from '@/engine/journalNetting';

/** The EVE (UTC) day a journal line falls on, as `YYYY-MM-DD`; null for an unparseable date. */
export function journalDayKey(entry: Pick<JournalRow, 'date'>): string | null {
  const time = new Date(entry.date).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

/** A day's net: every line's amount except own-Character transfers. */
export function journalDayNet(rows: readonly JournalRow[]): number {
  return rows.reduce(
    (sum, row) => (row.internal || row.amount === undefined ? sum : sum + row.amount),
    0
  );
}

/** "Fri 16 Oct": the day header, read in UTC so it matches the key. */
export function journalDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
