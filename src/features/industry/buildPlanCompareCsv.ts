import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { BuildResult } from '@/engine/industry/types';
import type { ComparedBuildRow } from './useComparedBuildResults';

/** A figure off the row's result — blank while loading, on a failed row, or where it's unpriceable. */
function figure(
  pick: (result: BuildResult) => number | null
): (row: ComparedBuildRow) => number | null {
  return (row) => (row.loading || !row.result ? null : pick(row.result));
}

/**
 * Export columns for Compare mode's table, in its order. Time is raw seconds
 * and margin a raw percent (the table's `20%` is `20`), so both sort and sum;
 * every cell the table shows as "…" or "—" is blank.
 */
export function buildPlanCompareCsvColumns(t: CsvTranslate): CsvColumn<ComparedBuildRow>[] {
  return [
    { header: t('industry.comparePlanColumn'), value: (row) => row.planName },
    { header: t('industry.product'), value: (row) => row.productName },
    { header: t('industry.runs'), value: (row) => row.runs },
    { header: t('industry.csvTimeSeconds'), value: figure((r) => r.seconds) },
    { header: t('industry.totalCost'), value: figure((r) => r.totalCost) },
    { header: t('industry.profit'), value: figure((r) => r.profit) },
    { header: t('industry.csvMarginPct'), value: figure((r) => r.marginPct) },
    { header: t('industry.iskPerHour'), value: figure((r) => r.iskPerHour) },
    { header: t('industry.breakEvenPrice'), value: figure((r) => r.breakEvenPrice) },
  ];
}
