import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { EmploymentHistoryRow } from './employmentHistory';
import { exportFlag } from '@/lib/exportFlag';
import { isoTime } from '@/lib/exportSheets';

const SECONDS_PER_DAY = 86_400;

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
      value: (row) =>
        row.ongoing
          ? undefined
          : isoTime(new Date(row.startDate).getTime() + row.tenureSeconds * 1000),
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
