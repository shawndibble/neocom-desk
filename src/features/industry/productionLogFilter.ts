import type { ProductionRunRecord } from '@/db';

/** The Records tab's date-range filter (issue #525). `null` means that bound is inactive. */
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
 * `run.loggedAt`'s own local calendar day, as `YYYY-MM-DD` — deliberately
 * *not* `toISOString().slice(0, 10)`: `loggedAt` is `Date.now()` at logging
 * time (a local instant), and a `<input type="date">` bound also reads/writes
 * the browser's local calendar day. Converting through UTC first would shift
 * a run logged late at night onto the wrong side of a day boundary for every
 * timezone that isn't UTC+0 — unlike `filterWalletJournal`'s equivalent
 * comparison, which is safe because ESI's `entry.date` is already a UTC
 * string, not a local instant being re-derived.
 */
function localDateString(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Once each run's own local day is derived, the bounds compare lexicographically same as `filterWalletJournal`'s. */
export function filterProductionRunsByDate(
  runs: readonly ProductionRunRecord[],
  filter: ProductionLogFilter
): ProductionRunRecord[] {
  return runs.filter((run) => {
    const day = localDateString(run.loggedAt);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    return true;
  });
}

export function activeProductionLogFilterCount(filter: ProductionLogFilter): number {
  return [filter.startDate, filter.endDate].filter((v) => v !== null).length;
}
