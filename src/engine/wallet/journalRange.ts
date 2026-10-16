/**
 * The Wallet Journal's "Range" select: which presets to offer given how far
 * back the local history reaches, the From date a preset sets, and which
 * preset a From/To pair already matches. Pure; EVE (UTC) days, like the
 * journal's own date filter.
 */

import { utcDay } from '@/engine/netWorth/snapshot';
import { DAY_MS } from '@/lib/age';
import { ARCHIVE_RANGE_DAYS } from './archiveCoverage';

/** A preset: its length in days, or all history. */
export type JournalRange = number | 'all';

/** The always-on short presets; the longer ones (`ARCHIVE_RANGE_DAYS`) need history. */
const SHORT_RANGE_DAYS = [7, 30] as const;

/** Presets to offer, shortest first. `reachedDays` is what `archiveRanges` found covered. */
export function journalRangeOptions(reachedDays: readonly number[]): JournalRange[] {
  return [
    ...SHORT_RANGE_DAYS,
    ...ARCHIVE_RANGE_DAYS.filter((days) => reachedDays.includes(days)),
    'all',
  ];
}

/** The From date a preset sets (To is always cleared); null for all history. */
export function journalRangeStart(range: JournalRange, nowMs: number): string | null {
  return range === 'all' ? null : utcDay(nowMs - range * DAY_MS);
}

/** The offered preset the dates equal, else `'custom'`. */
export function matchJournalRange(
  dates: { startDate: string | null; endDate: string | null },
  options: readonly JournalRange[],
  nowMs: number
): JournalRange | 'custom' {
  if (dates.endDate !== null) return 'custom';
  return options.find((range) => journalRangeStart(range, nowMs) === dates.startDate) ?? 'custom';
}
