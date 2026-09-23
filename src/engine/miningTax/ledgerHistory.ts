/**
 * Mining ledger history kept on the device (issue #1278). ESI's personal
 * mining ledger only returns the last 30 days; each fetch is merged into what
 * is already held so older days survive, up to `LEDGER_HISTORY_DAYS`.
 *
 * The prune counts back from the newest day held, not from the wall clock:
 * the result depends only on its inputs, and a pilot who stops mining for a
 * while keeps their history until the next fetch brings a newer day. The
 * Overview's range filter still hides anything outside the chosen window.
 */
import type { MiningLedgerRow } from './types';
import { shiftDate } from './yieldRange';

export const LEDGER_HISTORY_DAYS = 90;

function rowKey(row: MiningLedgerRow): string {
  return `${row.date}|${row.solar_system_id}|${row.type_id}`;
}

/**
 * `fresh` over `stored`: the same day/system/type takes the fresh quantity
 * (ESI's ledger row for today grows through the day); rows only `stored`
 * holds are kept. Rows one fetch reports more than once for the same key are
 * summed first, the same way `groupMiningYield` sums them — replacing would
 * drop all but the last. Sorted by date, then system, then type.
 */
export function mergeLedgerHistory(
  stored: readonly MiningLedgerRow[],
  fresh: readonly MiningLedgerRow[]
): MiningLedgerRow[] {
  const byKey = new Map<string, MiningLedgerRow>();
  for (const row of stored) byKey.set(rowKey(row), row);
  const freshByKey = new Map<string, MiningLedgerRow>();
  for (const row of fresh) {
    const key = rowKey(row);
    const seen = freshByKey.get(key);
    freshByKey.set(key, seen ? { ...seen, quantity: seen.quantity + row.quantity } : row);
  }
  for (const [key, row] of freshByKey) byKey.set(key, row);

  const merged = [...byKey.values()];
  if (merged.length === 0) return [];
  const newest = merged.reduce((max, row) => (row.date > max ? row.date : max), merged[0].date);
  const cutoff = shiftDate(newest, -(LEDGER_HISTORY_DAYS - 1));

  return merged
    .filter((row) => row.date >= cutoff)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.solar_system_id - b.solar_system_id ||
        a.type_id - b.type_id
    );
}
