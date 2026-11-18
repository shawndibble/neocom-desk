import { useMemo, useState } from 'react';
import { scaleToBudget, type BudgetScaled } from '@/engine/industry/budgetScale';
import type { MaterialCostLine } from '@/engine/industry/types';

/**
 * The copy list's budget (issue #6388): the typed ISK amount and the list it
 * scales to. A blank field is "no budget": `materials` is the input, untouched,
 * and `scaled` is null so the UI shows nothing about coverage.
 */
export function useShoppingBudget<T extends MaterialCostLine>(materials: readonly T[]) {
  const [value, setValue] = useState('');
  const budget = value === '' ? null : Number(value);
  const scaled: BudgetScaled<T> | null = useMemo(
    () => (budget === null || !Number.isFinite(budget) ? null : scaleToBudget(materials, budget)),
    [materials, budget]
  );
  return { value, setValue, scaled, materials: scaled ? scaled.materials : materials };
}
