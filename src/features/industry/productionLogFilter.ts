import type { ProductionRunRecord } from '@/db';
import { formatLocalDate } from '@/lib/localDate';

/** The Logs tab's date-range filter (issue #525). `null` means that bound is inactive. */
export interface ProductionLogFilter {
  /** Inclusive `YYYY-MM-DD`. */
  startDate: string | null;
  /** Inclusive `YYYY-MM-DD`. */
  endDate: string | null;
}

export const EMPTY_PRODUCTION_LOG_FILTER: ProductionLogFilter = {
  startDate: null,
  endDate: null,
};

/**
 * `formatLocalDate`, not `toISOString().slice(0, 10)`: `loggedAt` is
 * `Date.now()` at logging time (a local instant), and a `<input
 * type="date">` bound also reads/writes the browser's local calendar day.
 * Converting through UTC first would shift a run logged late at night onto
 * the wrong side of a day boundary for every timezone that isn't UTC+0 —
 * unlike `filterWalletJournal`'s equivalent comparison, which is safe
 * because ESI's `entry.date` is already a UTC string, not a local instant
 * being re-derived. Once each run's own local day is derived, the bounds
 * compare lexicographically same as `filterWalletJournal`'s.
 *
 * `timeZone` is the Time format preference (`'UTC'` for EVE time): the Logs
 * table renders each run's logged-at on that clock, so the day the filter
 * buckets it into has to be the day the row shows.
 */
export function filterProductionRunsByDate(
  runs: readonly ProductionRunRecord[],
  filter: ProductionLogFilter,
  timeZone?: string
): ProductionRunRecord[] {
  return runs.filter((run) => {
    const day = formatLocalDate(new Date(run.loggedAt), timeZone);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    return true;
  });
}

export function activeProductionLogFilterCount(filter: ProductionLogFilter): number {
  return [filter.startDate, filter.endDate].filter((v) => v !== null).length;
}
