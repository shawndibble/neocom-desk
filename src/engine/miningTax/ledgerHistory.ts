import type { MiningLedgerRow } from './types';
import { shiftDate } from './yieldRange';

export const LEDGER_HISTORY_DAYS = 365;

function rowKey(row: MiningLedgerRow): string {
  return `${row.date}|${row.solar_system_id}|${row.type_id}`;
}

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
