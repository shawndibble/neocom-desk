import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EmploymentHistoryRow } from './employmentHistory';
import { exportFlag } from '@/lib/exportFlag';

const SECONDS_PER_DAY = 86_400;

/**
 * Export columns for Employment History: corporation, join and leave dates,
 * tenure, and the badges the timeline shows (current, NPC, returned, short stay).
 * The join date passes through as ESI's raw timestamp (a real date in the
 * file), and the tenure is whole days — a number that sorts and sums — not
 * the table's "2y 3mo" rendering.
 */
export function employmentHistoryCsvColumns(
  t: CsvTranslate,
  corpNames: ReadonlyMap<number, string>
): CsvColumn<EmploymentHistoryRow>[] {
  return [
    {
      header: t('employmentHistory.corporation'),
      value: (row) => corpNames.get(row.corporationId) ?? `#${row.corporationId}`,
    },
    { header: t('employmentHistory.started'), value: (row) => row.startDate },
    {
      header: t('employmentHistory.csvEnded'),
      // The next record's start: the join date plus the stint. Blank for the current stint.
      value: (row) =>
        row.ongoing
          ? undefined
          : new Date(new Date(row.startDate).getTime() + row.tenureSeconds * 1000).toISOString(),
    },
    {
      header: t('employmentHistory.csvDurationDays'),
      value: (row) => Math.floor(row.tenureSeconds / SECONDS_PER_DAY),
    },
    { header: t('employmentHistory.current'), value: (row) => exportFlag(t, row.ongoing) },
    { header: t('employmentHistory.npc'), value: (row) => exportFlag(t, row.npc) },
    { header: t('employmentHistory.returned'), value: (row) => exportFlag(t, row.returned) },
    { header: t('employmentHistory.shortStay'), value: (row) => exportFlag(t, row.shortStay) },
  ];
}
