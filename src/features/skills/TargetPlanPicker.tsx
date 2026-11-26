import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { TargetPlan } from './useTargetPlan';

export interface TargetPlanPickerProps {
  target: TargetPlan;
  bare?: boolean;
  className?: string;
  prefix?: string;
}

export function TargetPlanPicker({
  target,
  bare = false,
  className,
  prefix,
}: TargetPlanPickerProps) {
  const { t } = useTranslation();
  const { plans, targetPlanId, setTargetPlanId } = target;

  if (!plans || plans.length < 2) return null;

  const select = (
    <Select value={targetPlanId ?? undefined} onValueChange={setTargetPlanId}>
      <SelectTrigger size="sm" aria-label={t('skills.targetPlan.label')} className={className}>
        {prefix ? (
          <span>
            <span className="text-text-dim">{prefix}: </span>
            <SelectValue />
          </span>
        ) : (
          <SelectValue />
        )}
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
