/**
 * The rows of a **Stock List**: each **Stock Target** against what the pilot
 * has listed at the market, its **Shortfall**, how much of that the hangar there
 * covers, the cost to source the rest, and a status word (GLOSSARY.md).
 *
 * Pure: quantities and prices are read by the feature layer and passed
 * in, so the same rows drive the Stock tab, the Overview card and the
 * below-target alert without any of them disagreeing about what "low" means.
 */

import type { HolderCount } from './onHand';

/** Below this share of its Stock Target an item reads as Low. */
export const LOW_FILL_RATIO = 0.5;

export type StockStatus = 'out' | 'low' | 'ok' | 'over';

/** Worst first. Also the order the filter chips list the statuses in. */
export const STOCK_STATUSES: readonly StockStatus[] = ['out', 'low', 'ok', 'over'];

export interface StockRowInput {
  typeId: number;
  target: number;
  /** Units the pilot has listed for sale at the market: what the status is measured by. */
  listed: number;
  /** Units in the pilot's hangars at the market's station, ready to list. */
  inHangar: number;
  /** ISK per unit, or null when no price is known. */
  price: number | null;
  /** Whose sell orders make up `listed`, biggest first. Attribution only: no status or total reads it. */
  listedBy?: readonly HolderCount[];
  /** Whose hangars make up `inHangar`, biggest first. */
  inHangarBy?: readonly HolderCount[];
}

export interface StockRow extends StockRowInput {
  /** Stock Target minus listed. */
  shortfall: number;
  /** The part of the Shortfall the hangar at the market covers. */
  fromHangar: number;
  /** The rest of the Shortfall: to buy, build or haul in. */
  toSource: number;
  /** Listed over Stock Target; above 1 when over. */
  fill: number;
  status: StockStatus;
  /** What is still to source, times price. Zero when nothing is; null when unpriced. */
  costToFill: number | null;
}

export interface StockSummary {
  out: number;
  low: number;
  ok: number;
  over: number;
  /** Items whose hangar stock at the market can cover some of the Shortfall. */
  readyToList: number;
  /** Sum of the known costs to fill; unpriced ones are counted separately. */
  costToFill: number;
  unpricedShort: number;
}

export function stockStatus(listed: number, target: number): StockStatus {
  if (listed <= 0) return 'out';
  if (listed < target * LOW_FILL_RATIO) return 'low';
  if (listed > target) return 'over';
  return 'ok';
}

function toRow(input: StockRowInput): StockRow {
  const listed = Math.max(0, input.listed);
  const inHangar = Math.max(0, input.inHangar);
  const shortfall = Math.max(0, input.target - listed);
  const fromHangar = Math.min(shortfall, inHangar);
  const toSource = shortfall - fromHangar;
  let costToFill: number | null = 0;
  if (toSource > 0) costToFill = input.price === null ? null : toSource * input.price;
  return {
    ...input,
    listed,
    inHangar,
    shortfall,
    fromHangar,
    toSource,
    fill: listed / input.target,
    status: stockStatus(listed, input.target),
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
  const summary: StockSummary = {
    out: 0,
    low: 0,
    ok: 0,
    over: 0,
    readyToList: 0,
    costToFill: 0,
    unpricedShort: 0,
  };
  for (const row of rows) {
    summary[row.status] += 1;
    if (row.fromHangar > 0) summary.readyToList += 1;
    if (row.costToFill === null) summary.unpricedShort += 1;
    else summary.costToFill += row.costToFill;
  }
  return summary;
}

export interface BuilderSplit {
  /** Rows still to source that the pilot holds a blueprint for. */
  buildable: StockRow[];
  /** Rows still to source with no blueprint: build after getting one, or buy. */
  needsBlueprintOrBuy: StockRow[];
}

/** The Builder view's two groups. Rows the listings or the hangar cover belong to neither. */
export function splitForBuilders(
  rows: readonly StockRow[],
  canBuild: (typeId: number) => boolean
): BuilderSplit {
  const split: BuilderSplit = { buildable: [], needsBlueprintOrBuy: [] };
  for (const row of rows) {
    if (row.toSource <= 0) continue;
    (canBuild(row.typeId) ? split.buildable : split.needsBlueprintOrBuy).push(row);
  }
  return split;
}

/** Worst first, as `compareRows` ranks: the Status column sorts by this. */
export const stockStatusRank = (status: StockStatus): number => STATUS_RANK[status];
