import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import type { DisplayRow } from './groupRows';

/** Statuses the pilot still has something to do about — the ledger's Open section. */
export const OPEN_STATUSES: ReadonlySet<MiningTaxRowStatus> = new Set([
  'unassigned',
  'needs-review',
  'outstanding',
]);

export interface HistoryMonth {
  /** `YYYY-MM`, the EVE (UTC) month. */
  month: string;
  rows: DisplayRow[];
}

/**
 * The Tax tab's two sections (scope decision 20261004, "owed first, history
 * below"): Open is every row still needing the pilot — owed, unassigned, or
 * grown since it was assigned — and History is everything settled, paid or
 * not taxed, grouped by month so it can fold away. `lastDateOf` dates a
 * combined row by its last day, which is when that session ended.
 */
export function splitLedger(
  rows: readonly DisplayRow[],
  lastDateOf: (row: DisplayRow) => string
): { open: DisplayRow[]; history: HistoryMonth[] } {
  const open: DisplayRow[] = [];
  const byMonth = new Map<string, { row: DisplayRow; date: string }[]>();
  for (const row of rows) {
    if (OPEN_STATUSES.has(row.status)) {
      open.push(row);
      continue;
    }
    const date = lastDateOf(row);
    const month = date.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push({ row, date });
    byMonth.set(month, list);
  }
  const history = [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({
      month,
      rows: list.sort((a, b) => b.date.localeCompare(a.date)).map((x) => x.row),
    }));
  return { open, history };
}
