/**
 * Item Detail's "Made from" cost line: what one run's inputs cost to buy, and
 * the margin that leaves against the item's best sell. A rough guide, not a
 * Build Plan: base (ME 0) quantities, no job fee, taxes or owned stock.
 *
 * Priced the way a Build Plan prices its materials by default: the hub's
 * lowest sell (a plan's `'sell'` material price basis, `priceBasis.ts`), one
 * cost line per input through the plan engine's own `materialCostLines`, so
 * an input with no price blocks the total exactly as it blocks a plan's.
 */
import { materialCostLines } from '@/engine/industry/sourcing';
import type { HubPrices } from '@/engine/industry/types';
import type { HubAggregate } from '@/market/prices';

export interface RunInput {
  typeID: number;
  /** Per run, ME 0. */
  quantity: number;
}

/** The inputs' cost at their lowest sell, or null when any of them has no sell price. */
export function runInputCost(
  inputs: readonly RunInput[],
  aggregates: ReadonlyMap<number, HubAggregate>
): number | null {
  const sellPrices: HubPrices = {};
  for (const [typeId, aggregate] of aggregates) {
    if (aggregate.sellMin !== null) sellPrices[typeId] = aggregate.sellMin;
  }
  const lines = materialCostLines(
    inputs.map((input) => ({
      typeID: input.typeID,
      baseQuantity: input.quantity,
      quantity: input.quantity,
    })),
    sellPrices
  );
  if (lines.some((line) => line.unpriced)) return null;
  return lines.reduce((sum, line) => sum + line.lineCost, 0);
}

/**
 * Profit over revenue in percent, the way a Build Plan states its margin:
 * (what a run's output sells for − its input cost) / what it sells for.
 * Null with no positive best sell to compare against.
 */
export function marginOnBestSell(
  inputCost: number,
  bestSell: number | null | undefined,
  outputQuantity: number
): number | null {
  if (bestSell == null || bestSell <= 0 || outputQuantity <= 0) return null;
  const revenue = bestSell * outputQuantity;
  return ((revenue - inputCost) / revenue) * 100;
}
