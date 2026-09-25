import { useState } from 'react';
import { resourceOverage } from '@/engine/fittings/skillGaps';

/**
 * Over-budget state for one resource readout, shared by the List's bars and
 * the Ring's gauges. `flashKey` bumps each time the readout goes from within
 * budget to over (a Character switch that re-states it included) — the `null`
 * gap while stats recompute doesn't count. Put it on the readout's `key` and
 * flash when `flashKey > 0 && overBudget`.
 */
export function useOverBudgetFlash(used: number | null, total: number | null) {
  const known = used !== null && total !== null;
  const overage = resourceOverage(used, total);
  const overBudget = overage > 0;

  const [wasOver, setWasOver] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  if (known && overBudget !== wasOver) {
    setWasOver(overBudget);
    if (overBudget) setFlashKey((key) => key + 1);
  }

  return { known, overage, overBudget, flashKey };
}
