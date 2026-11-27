import { useState } from 'react';
import { resourceOverage, resourceTight } from '@/engine/fittings/skillGaps';

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

  return { known, overage, overBudget, tight: resourceTight(used, total), flashKey };
}
