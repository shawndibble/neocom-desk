/**
 * Optional columns and device-local visible-columns preferences for the three
 * production-run tables: the Records tab's By item and All production runs, and
 * a Build Plan's own runs. Each table's identity column (product, logged date)
 * and its row-actions column are not in a catalog: a table that can lose the
 * column naming its rows, or its only way to act on them, has lost them.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const PRODUCTION_LOG_ITEM_COLUMN_IDS = [
  'runsLogged',
  'unitsProduced',
  'unitsSold',
  'realizedProfit',
  'avgMargin',
  'soldUnitsMargin',
  'unsoldCost',
] as const;
export type ProductionLogItemColumnId = (typeof PRODUCTION_LOG_ITEM_COLUMN_IDS)[number];

export const useVisibleProductionLogItemColumns = createColumnVisibilitySetting({
  key: 'productionLogItemVisibleColumns',
  ids: PRODUCTION_LOG_ITEM_COLUMN_IDS,
  allowEmpty: true,
});

export const PRODUCTION_LOG_RUN_COLUMN_IDS = [
  'quantity',
  'totalCost',
  'quantitySold',
  'realizedProfit',
  'status',
] as const;
export type ProductionLogRunColumnId = (typeof PRODUCTION_LOG_RUN_COLUMN_IDS)[number];

export const useVisibleProductionLogRunColumns = createColumnVisibilitySetting({
  key: 'productionLogRunVisibleColumns',
  ids: PRODUCTION_LOG_RUN_COLUMN_IDS,
  allowEmpty: true,
});

export const PLAN_RUN_COLUMN_IDS = [
  'quantity',
  'totalCost',
  'realizedRevenue',
  'realizedProfit',
  'quantitySold',
  'status',
] as const;
export type PlanRunColumnId = (typeof PLAN_RUN_COLUMN_IDS)[number];

export const useVisiblePlanRunColumns = createColumnVisibilitySetting({
  key: 'productionPlanRunVisibleColumns',
  ids: PLAN_RUN_COLUMN_IDS,
  allowEmpty: true,
});

/** The columns to draw: every one outside the catalog, and the catalog's ticked ones. */
export function shownProductionColumns<Id extends string, C extends { id: string }>(
  columns: readonly C[],
  catalog: readonly Id[],
  isVisible: (id: Id) => boolean
): C[] {
  const optional: readonly string[] = catalog;
  return columns.filter((column) => !optional.includes(column.id) || isVisible(column.id as Id));
}
