import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { TargetPlan } from './useTargetPlan';

export interface TargetPlanPickerProps {
  target: TargetPlan;
}

/**
 * "Adding to: <plan>" — shown beside every Add-to-Plan action that shares
 * `useTargetPlan`. Renders nothing while there is exactly zero or one plan:
 * zero has no plan to name (the Add button itself reads "Create Plan &
 * Add"), and one is picked automatically with nothing to choose.
 */
export function TargetPlanPicker({ target }: TargetPlanPickerProps) {
  const { t } = useTranslation();
  const { plans, targetPlanId, setTargetPlanId } = target;

  if (!plans || plans.length < 2) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-text-dim">
      <span>{t('skills.targetPlan.label')}</span>
      <Select value={targetPlanId ?? undefined} onValueChange={setTargetPlanId}>
        <SelectTrigger size="sm" aria-label={t('skills.targetPlan.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              {plan.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
