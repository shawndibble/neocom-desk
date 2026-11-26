import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import type { DisplayRow } from './groupRows';

export const OPEN_STATUSES: ReadonlySet<MiningTaxRowStatus> = new Set([
  'unassigned',
  'needs-review',
  'outstanding',
]);

export interface HistoryMonth {
  month: string;
  rows: DisplayRow[];
}

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
