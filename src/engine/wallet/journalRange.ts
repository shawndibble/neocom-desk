/**
 * The Wallet Journal's "Range" select: which presets to offer given how far
 * back the local history reaches, and the first day a preset covers. Pure;
 * EVE (UTC) days, like the journal's own date filter. Every preset counts
 * today as its first day, so 7 days is today and the six before it (the
 * convention of `miningTax/yieldRange.ts`).
 */

import { utcDay } from '@/engine/netWorth/snapshot';
import { DAY_MS } from '@/lib/age';
import { ARCHIVE_RANGE_DAYS } from './archiveCoverage';

/** A preset: its length in days, or all history. */
export type JournalRange = number | 'all';

/** The Select value for a From/To pair no preset produced. */
export const CUSTOM_RANGE = 'custom';

/** The always-on short presets; the longer ones (`ARCHIVE_RANGE_DAYS`) need history. */
const SHORT_RANGE_DAYS = [7, 30] as const;

/** i18n key of each preset's label. */
export const JOURNAL_RANGE_LABEL_KEYS: Readonly<Record<JournalRange, string>> = {
  7: 'wallet.range.last7',
  30: 'wallet.range.last30',
  90: 'wallet.range.last90',
  180: 'wallet.range.last180',
  365: 'wallet.range.last365',
  all: 'wallet.range.all',
};

/**
 * Presets to offer, shortest first. `reachedDays` is what `archiveRanges` found
 * covered; `selected` is the preset already chosen, kept on offer so it never
 * reads as something else while that history is still loading.
 */
export function journalRangeOptions(
  reachedDays: readonly number[],
  selected: number | null = null
): JournalRange[] {
  return [
    ...SHORT_RANGE_DAYS,
    ...ARCHIVE_RANGE_DAYS.filter((days) => days === selected || reachedDays.includes(days)),
    'all',
  ];
}

/** The first EVE day a last-`days`-days preset covers: today and the `days - 1` before it. */
export function journalRangeStart(days: number, nowMs: number): string {
  return utcDay(nowMs - (days - 1) * DAY_MS);
}
