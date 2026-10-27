import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EmploymentHistoryRow } from './employmentHistory';

const SECONDS_PER_DAY = 86_400;

/**
 * Export columns for Employment History: corporation, join date, tenure.
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
      header: t('employmentHistory.csvDurationDays'),
      value: (row) => Math.floor(row.tenureSeconds / SECONDS_PER_DAY),
    },
  ];
}
