import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { BuildResult } from '@/engine/industry/types';
import type { HubOrderCounts } from '@/market/fuzzwork';
import { COMPARE_COLUMN_IDS, type CompareColumnId } from './compareColumns';
import type { ComparedBuildRow } from './useComparedBuildResults';

/** A figure off the row's result — blank while loading, on a failed row, or where it's unpriceable. */
function figure(
  pick: (result: BuildResult) => number | null
): (row: ComparedBuildRow) => number | null {
  return (row) => (row.loading || !row.result ? null : pick(row.result));
}

export interface CompareCsvOptions {
  /** Why a plan has no figures (a failed compute, or an unpriceable material or product); null when it resolved. */
  unresolvedReason?: (row: ComparedBuildRow) => string | null | undefined;
  /** A row's average orders traded per day in the hub's region. */
  ordersPerDay?: (row: ComparedBuildRow) => number | null | undefined;
  /** A row's open order counts at the chosen hub; null/undefined while loading, failed or unknown. */
  hubCounts?: (row: ComparedBuildRow) => HubOrderCounts | null | undefined;
}

/**
 * Export columns for Compare mode's table, in its order. Time is raw seconds
 * and margin a raw percent (the table's `20%` is `20`), so both sort and sum;
 * every cell the table shows as "…" or "—" is blank. Every column is
 * exported whatever the column picker hides — the picker is a view choice,
 * the file holds the whole comparison.
 */
export function buildPlanCompareCsvColumns(
  t: CsvTranslate,
  {
    hubCounts = () => null,
    ordersPerDay = () => null,
    unresolvedReason = () => null,
  }: CompareCsvOptions = {}
): CsvColumn<ComparedBuildRow>[] {
  const hub =
    (pick: (counts: HubOrderCounts) => number) =>
    (row: ComparedBuildRow): number | null => {
      const counts = hubCounts(row);
      return counts ? pick(counts) : null;
    };
  const byId: Record<CompareColumnId, CsvColumn<ComparedBuildRow>> = {
    product: { header: t('industry.product'), value: (row) => row.productName },
    runs: { header: t('industry.runs'), value: (row) => row.runs },
    duration: { header: t('industry.csvTimeSeconds'), value: figure((r) => r.seconds) },
    materialCost: { header: t('industry.materialCost'), value: figure((r) => r.materialCost) },
    jobFee: { header: t('industry.jobFee'), value: figure((r) => r.jobFee.total) },
    totalCost: { header: t('industry.totalCost'), value: figure((r) => r.totalCost) },
    revenue: { header: t('industry.revenue'), value: figure((r) => r.revenue) },
    profit: { header: t('industry.profit'), value: figure((r) => r.profit) },
    margin: { header: t('industry.csvMarginPct'), value: figure((r) => r.marginPct) },
    iskPerHour: { header: t('industry.iskPerHour'), value: figure((r) => r.iskPerHour) },
    breakEvenPrice: {
      header: t('industry.breakEvenPrice'),
      value: figure((r) => r.breakEvenPrice),
    },
    buyCost: { header: t('industry.compareBuyCost'), value: figure((r) => r.buyCost) },
    hubOrdersPerDay: {
      header: t('industry.compareHubOrdersPerDay'),
      value: (row) => ordersPerDay(row) ?? null,
    },
    hubBuyOrders: { header: t('industry.compareHubBuyOrders'), value: hub((c) => c.buyOrders) },
    hubSellOrders: { header: t('industry.compareHubSellOrders'), value: hub((c) => c.sellOrders) },
    hubBuyVolume: { header: t('industry.compareHubBuyVolume'), value: hub((c) => c.buyVolume) },
    hubSellVolume: { header: t('industry.compareHubSellVolume'), value: hub((c) => c.sellVolume) },
  };
  return [
    { header: t('industry.comparePlanColumn'), value: (row) => row.planName },
    ...COMPARE_COLUMN_IDS.map((id) => byId[id]),
    {
      header: t('industry.csvUnresolvedReason'),
      value: (row) => (row.loading ? null : (unresolvedReason(row) ?? null)),
    },
  ];
}
