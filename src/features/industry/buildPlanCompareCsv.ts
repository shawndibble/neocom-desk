import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { BuildResult } from '@/engine/industry/types';
import type { HubOrderCounts } from '@/market/fuzzwork';
import {
  COMPARE_COLUMN_IDS,
  COMPARE_DEFAULT_COLUMNS,
  type CompareColumnId,
} from './compareColumns';
import type { ComparedBuildRow } from './useComparedBuildResults';

/** A figure off the row's result — blank while loading, on a failed row, or where it's unpriceable. */
function figure(
  pick: (result: BuildResult) => number | null
): (row: ComparedBuildRow) => number | null {
  return (row) => (row.loading || !row.result ? null : pick(row.result));
}

export interface CompareCsvOptions {
  /** The columns the table shows; the plan name is always first. Defaults to the table's own default set. */
  visible?: readonly CompareColumnId[];
  /** A row's order counts at the chosen hub; null/undefined while loading, failed or unknown. */
  /** A row's average orders traded per day in the hub's region. */
  ordersPerDay?: (row: ComparedBuildRow) => number | null | undefined;
  hubCounts?: (row: ComparedBuildRow) => HubOrderCounts | null | undefined;
}

/**
 * Export columns for Compare mode's table, in its order. Time is raw seconds
 * and margin a raw percent (the table's `20%` is `20`), so both sort and sum;
 * every cell the table shows as "…" or "—" is blank. Only the columns the
 * table shows are exported, so the file matches the screen.
 */
export function buildPlanCompareCsvColumns(
  t: CsvTranslate,
  {
    visible = COMPARE_DEFAULT_COLUMNS,
    hubCounts = () => null,
    ordersPerDay = () => null,
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
    ...COMPARE_COLUMN_IDS.filter((id) => visible.includes(id)).map((id) => byId[id]),
  ];
}
