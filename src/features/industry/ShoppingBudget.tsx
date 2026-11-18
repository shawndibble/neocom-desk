import { useTranslation } from 'react-i18next';
import { IskInput } from '@/components/ui';
import type { BudgetScaled } from '@/engine/industry/budgetScale';
import type { useShoppingBudget } from './useShoppingBudget';

interface ShoppingBudgetProps {
  budget: Pick<ReturnType<typeof useShoppingBudget>, 'value' | 'setValue' | 'scaled'>;
  nameFor: (typeID: number) => string;
}

/** What the budget does to the list, as one muted line. */
function coverageNote(
  scaled: BudgetScaled,
  nameFor: (typeID: number) => string,
  t: ReturnType<typeof useTranslation>['t']
) {
  const percent = Math.floor(scaled.coverage * 100);
  const heavy = [...scaled.heavy].map(nameFor).join(', ');
  return heavy
    ? t('industry.budgetCoverageHeavy', { percent, items: heavy })
    : t('industry.budgetCoverage', { percent });
}

/**
 * The copy list's budget field: scales the purchase to what the pilot can
 * spend today. Leave it blank for the full need.
 */
export function ShoppingBudget({ budget, nameFor }: ShoppingBudgetProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <IskInput
        size="sm"
        value={budget.value}
        onChange={budget.setValue}
        aria-label={t('industry.budgetLabel')}
        placeholder={t('industry.budgetPlaceholder')}
        className="w-40"
      />
      {budget.scaled && (
        <p className="text-xs text-text-dim">{coverageNote(budget.scaled, nameFor, t)}</p>
      )}
    </div>
  );
}
