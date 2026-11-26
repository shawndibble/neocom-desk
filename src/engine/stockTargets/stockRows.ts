import type { HolderCount } from './onHand';

export const LOW_FILL_RATIO = 0.5;

export type StockStatus = 'out' | 'low' | 'ok' | 'over';

export const STOCK_STATUSES: readonly StockStatus[] = ['out', 'low', 'ok', 'over'];

export interface StockRowInput {
  typeId: number;
  target: number;
  listed: number;
  inHangar: number;
  price: number | null;
  listedBy?: readonly HolderCount[];
  inHangarBy?: readonly HolderCount[];
  onContract?: number;
  inJobs?: number;
  nextJobEnd?: string;
}

export interface StockRow extends StockRowInput {
  shortfall: number;
  fromHangar: number;
  inJobs: number;
  fromJobs: number;
  toSource: number;
  fill: number;
  status: StockStatus;
  costToFill: number | null;
}

export interface StockSummary {
  out: number;
  low: number;
  ok: number;
  over: number;
  readyToList: number;
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
  const inJobs = Math.max(0, input.inJobs ?? 0);
  const fromJobs = Math.min(shortfall - fromHangar, inJobs);
  const toSource = shortfall - fromHangar - fromJobs;
  let costToFill: number | null = 0;
  if (toSource > 0) costToFill = input.price === null ? null : toSource * input.price;
  return {
    ...input,
    listed,
    inHangar,
    shortfall,
    fromHangar,
    inJobs,
    fromJobs,
    toSource,
    fill: listed / input.target,
    status: stockStatus(listed, input.target),
    costToFill,
  };
}

const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, over: 3 };

function compareRows(a: StockRow, b: StockRow): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  const costA = a.costToFill ?? -1;
  const costB = b.costToFill ?? -1;
  if (costA !== costB) return costB - costA;
  return a.fill - b.fill;
}

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
  buildable: StockRow[];
  needsBlueprintOrBuy: StockRow[];
}

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

export const stockStatusRank = (status: StockStatus): number => STATUS_RANK[status];
