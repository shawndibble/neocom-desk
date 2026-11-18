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

export interface BudgetScaled {
  /** The lines with `remainingQuantity` scaled; same shape as the input. */
  materials: MaterialCostLine[];
  /** Scaled cost over full cost, 0..1. 1 when the budget covers the need. */
  coverage: number;
  /** typeIDs of lines at or above `HEAVY_LINE_SHARE` of the budget. */
  heavy: Set<number>;
}

const costOf = (m: MaterialCostLine) => m.remainingQuantity * (m.unitPrice ?? 0);

export function scaleToBudget(
  materials: readonly MaterialCostLine[],
  budget: number
): BudgetScaled {
  const fullCost = materials.reduce((sum, m) => sum + costOf(m), 0);
  if (budget >= fullCost)
    return { materials: [...materials], coverage: 1, heavy: heavyLines(materials, budget) };
  const factor = Math.max(0, budget) / fullCost;
  const scaled = materials.map((m) => ({
    ...m,
    remainingQuantity: Math.floor(m.remainingQuantity * factor),
  }));
  return {
    materials: scaled,
    coverage: scaled.reduce((sum, m) => sum + costOf(m), 0) / fullCost,
    heavy: heavyLines(scaled, budget),
  };
}

function heavyLines(materials: readonly MaterialCostLine[], budget: number): Set<number> {
  const heavy = new Set<number>();
  if (budget <= 0) return heavy;
  for (const m of materials) if (costOf(m) >= budget * HEAVY_LINE_SHARE) heavy.add(m.typeID);
  return heavy;
}
