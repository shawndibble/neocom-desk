import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { TargetPlan } from './useTargetPlan';

export interface TargetPlanPickerProps {
  target: TargetPlan;
  /** Just the select, for a caller that labels it itself (the fitting stats column). */
  bare?: boolean;
  /** The select's width when `bare`. */
  className?: string;
}

/** Renders nothing under 2 plans — nothing to choose (0: the Add button itself offers to create one; 1: auto-picked). */
export function TargetPlanPicker({ target, bare = false, className }: TargetPlanPickerProps) {
  const { t } = useTranslation();
  const { plans, targetPlanId, setTargetPlanId } = target;

  if (!plans || plans.length < 2) return null;

  const select = (
    <Select value={targetPlanId ?? undefined} onValueChange={setTargetPlanId}>
      <SelectTrigger size="sm" aria-label={t('skills.targetPlan.label')} className={className}>
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
  );
  if (bare) return select;
  return (
    <div className="flex items-center gap-2 text-xs text-text-dim">
      <span>{t('skills.targetPlan.label')}</span>
      {select}
    </div>
  );
}
