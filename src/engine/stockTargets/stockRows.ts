/**
 * The rows of a **Stock List**: each **Stock Target** against what is on hand,
 * its **Shortfall**, the cost to fill it, and a status word (CONTEXT.md).
 *
 * Pure: on-hand quantities and prices are read by the feature layer and passed
 * in, so the same rows drive the Targets tab, the Overview card and the
 * below-target alert without any of them disagreeing about what "low" means.
 */

/** Below this share of its Stock Target an item reads as Low. */
export const LOW_FILL_RATIO = 0.5;

export type StockStatus = 'out' | 'low' | 'ok' | 'over';

/** Worst first. Also the order the filter chips list the statuses in. */
export const STOCK_STATUSES: readonly StockStatus[] = ['out', 'low', 'ok', 'over'];

export interface StockRowInput {
  typeId: number;
  target: number;
  onHand: number;
  /** ISK per unit, or null when no price is known. */
  price: number | null;
}

export interface StockRow extends StockRowInput {
  shortfall: number;
  /** On hand over Stock Target; above 1 when over. */
  fill: number;
  status: StockStatus;
  /** Shortfall times price. Zero when nothing is short; null when short and unpriced. */
  costToFill: number | null;
}

export interface StockSummary {
  out: number;
  low: number;
  ok: number;
  over: number;
  /** Sum of the known costs to fill; unpriced shortfalls are counted separately. */
  costToFill: number;
  unpricedShort: number;
}

export function stockStatus(onHand: number, target: number): StockStatus {
  if (onHand <= 0) return 'out';
  if (onHand < target * LOW_FILL_RATIO) return 'low';
  if (onHand > target) return 'over';
  return 'ok';
}

function toRow(input: StockRowInput): StockRow {
  const onHand = Math.max(0, input.onHand);
  const shortfall = Math.max(0, input.target - onHand);
  let costToFill: number | null = 0;
  if (shortfall > 0) costToFill = input.price === null ? null : shortfall * input.price;
  return {
    ...input,
    onHand,
    shortfall,
    fill: onHand / input.target,
    status: stockStatus(onHand, input.target),
    costToFill,
  };
}

const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, over: 3 };

/**
 * Worst first: by status, then the dearest shortfall (an unpriced shortfall
 * ranks just below the priced ones in its status, since its cost is unknown,
 * not small), then the emptiest.
 */
function compareRows(a: StockRow, b: StockRow): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  const costA = a.costToFill ?? -1;
  const costB = b.costToFill ?? -1;
  if (costA !== costB) return costB - costA;
  return a.fill - b.fill;
}

/** One row per usable Stock Target, worst first. A target of 0 or less is dropped. */
export function buildStockRows(inputs: readonly StockRowInput[]): StockRow[] {
  return inputs
    .filter((input) => input.target > 0)
    .map(toRow)
    .sort(compareRows);
}

export function summarizeStock(rows: readonly StockRow[]): StockSummary {
  const summary: StockSummary = { out: 0, low: 0, ok: 0, over: 0, costToFill: 0, unpricedShort: 0 };
  for (const row of rows) {
    summary[row.status] += 1;
    if (row.costToFill === null) summary.unpricedShort += 1;
    else summary.costToFill += row.costToFill;
  }
  return summary;
}

export interface BuilderSplit {
  /** Short rows the pilot holds a blueprint for. */
  buildable: StockRow[];
  /** Short rows with no blueprint: build after getting one, or buy. */
  needsBlueprintOrBuy: StockRow[];
}

/** The Builder view's two groups. Rows that are not short belong to neither. */
export function splitForBuilders(
  rows: readonly StockRow[],
  canBuild: (typeId: number) => boolean
): BuilderSplit {
  const split: BuilderSplit = { buildable: [], needsBlueprintOrBuy: [] };
  for (const row of rows) {
    if (row.shortfall <= 0) continue;
    (canBuild(row.typeId) ? split.buildable : split.needsBlueprintOrBuy).push(row);
  }
  return split;
}
