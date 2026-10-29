/**
 * How a Build Plan's input cost moved over the last 7 days, on the daily open
 * prices (one side, one hub): the plan's own inputs and product only. Pure.
 * Daily value against daily value — never an order-book price against a
 * history average.
 */
import type { OpenPricePoint } from './priceHistoryOpen';
import { shiftUtcDate } from '@/engine/localDay';

export const INPUT_COST_MOVE_DAYS = 7;
/** The line shows only when build cost moved at least this many percent, up or down. */
export const INPUT_COST_MOVE_MIN_PCT = 5;
/** Inputs with a usable series must carry at least this share of the plan's input cost, or the line would speak for a sliver. */
export const INPUT_COST_MOVE_MIN_COVERAGE = 0.8;

type Side = 'buy' | 'sell';

export interface InputCostMoveInput {
  typeID: number;
  /** Units still to buy (owned units cost nothing). */
  quantity: number;
  /** What the plan costs this line, to judge how much of the cost the series cover. */
  lineCost: number;
}

export interface InputCostMove {
  /** Percent change of the inputs' summed cost over the window (10 = +10%). */
  costPct: number;
  /** The input that moved the cost most, in ISK, and its share of the priced cost. */
  topInput: { typeID: number; sharePct: number };
  /** The product's own change over the same window; null without history. */
  productPct: number | null;
}

interface Window {
  latest: number;
  base: number;
}

/** Newest priced day on `side` and the last priced day on or before 7 days earlier; null when the series doesn't reach back. */
function sideWindow(points: readonly OpenPricePoint[] | undefined, side: Side): Window | null {
  const priced = (points ?? [])
    .map((p) => ({ date: p.date, value: p[side] }))
    .filter((p): p is { date: string; value: number } => p.value !== null && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const newest = priced[priced.length - 1];
  if (!newest) return null;
  const cutoff = shiftUtcDate(newest.date, -INPUT_COST_MOVE_DAYS);
  let base: number | undefined;
  for (const p of priced) if (p.date <= cutoff) base = p.value;
  return base === undefined ? null : { latest: newest.value, base };
}

export function inputCostMove(args: {
  inputs: readonly InputCostMoveInput[];
  series: ReadonlyMap<number, readonly OpenPricePoint[]>;
  materialSide: Side;
  product: { typeID: number; side: Side } | null;
}): InputCostMove | null {
  let now = 0;
  let then = 0;
  let coveredLineCost = 0;
  let totalLineCost = 0;
  let top: { typeID: number; delta: number; cost: number } | null = null;
  for (const input of args.inputs) {
    if (input.quantity <= 0) continue;
    totalLineCost += input.lineCost;
    const w = sideWindow(args.series.get(input.typeID), args.materialSide);
    if (!w) continue;
    const cost = input.quantity * w.latest;
    const delta = cost - input.quantity * w.base;
    coveredLineCost += input.lineCost;
    now += cost;
    then += input.quantity * w.base;
    if (!top || Math.abs(delta) > Math.abs(top.delta)) top = { typeID: input.typeID, delta, cost };
  }
  if (!top || then <= 0 || coveredLineCost < totalLineCost * INPUT_COST_MOVE_MIN_COVERAGE) {
    return null;
  }
  const costPct = (now / then - 1) * 100;
  if (Math.abs(costPct) < INPUT_COST_MOVE_MIN_PCT) return null;
  const pw = args.product
    ? sideWindow(args.series.get(args.product.typeID), args.product.side)
    : null;
  return {
    costPct,
    topInput: { typeID: top.typeID, sharePct: (top.cost / now) * 100 },
    productPct: pw ? (pw.latest / pw.base - 1) * 100 : null,
  };
}
