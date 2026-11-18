/**
 * Scales a shopping list down to a budget in ISK (issue #6388): every line's
 * remaining quantity is multiplied by the same factor (budget / full cost) and
 * rounded DOWN to whole units, so the priced total can never exceed the
 * budget. Buy-scaling only — it says nothing about whether the scaled list
 * still builds a whole run.
 *
 * Priced at each line's own `unitPrice`, which the plan has already set at its
 * Material Price Basis. An unpriced line has no cost to weigh but is scaled by
 * the same factor, so the list keeps its proportions.
 */

import type { MaterialCostLine } from '@/engine/industry/types';

/** A line costing at least this share of the budget is worth a second look. */
export const HEAVY_LINE_SHARE = 0.1;

/** A material line, optionally carrying the Blueprint Acquisition marker. */
type BudgetLine = MaterialCostLine & { acquisitionTier?: unknown };

export interface BudgetScaled<T extends BudgetLine> {
  /** The lines with `remainingQuantity` scaled; same shape as the input. */
  materials: T[];
  /** Scaled cost over full cost, 0..1. 1 when the budget covers the need. */
  coverage: number;
  /** typeIDs of lines at or above `HEAVY_LINE_SHARE` of the budget. */
  heavy: Set<number>;
}

const isScaled = (m: BudgetLine) => m.acquisitionTier === undefined;
const costOf = (m: BudgetLine) => (isScaled(m) ? m.remainingQuantity * (m.unitPrice ?? 0) : 0);
const sumCost = (lines: readonly BudgetLine[]) => lines.reduce((sum, m) => sum + costOf(m), 0);

export function scaleToBudget<T extends BudgetLine>(
  materials: readonly T[],
  budget: number
): BudgetScaled<T> {
  const fullCost = sumCost(materials);
  if (budget >= fullCost && budget > 0)
    return { materials: [...materials], coverage: 1, heavy: heavyLines(materials, budget) };
  const factor = fullCost > 0 ? Math.max(0, budget) / fullCost : 0;
  const scaled = materials.map((m) =>
    isScaled(m) ? { ...m, remainingQuantity: Math.floor(m.remainingQuantity * factor) } : m
  );
  return {
    materials: scaled,
    coverage: fullCost > 0 ? sumCost(scaled) / fullCost : 0,
    heavy: heavyLines(scaled, budget),
  };
}

function heavyLines(materials: readonly BudgetLine[], budget: number): Set<number> {
  const heavy = new Set<number>();
  if (budget <= 0) return heavy;
  for (const m of materials) if (costOf(m) >= budget * HEAVY_LINE_SHARE) heavy.add(m.typeID);
  return heavy;
}
