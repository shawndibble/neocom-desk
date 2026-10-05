import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { PlanEntry } from '@/engine/types';
import { TargetPlanPicker } from './TargetPlanPicker';
import type { TargetPlan } from './useTargetPlan';

export interface AddedToPlan {
  planId: string;
  planName: string;
  entries: readonly PlanEntry[];
}

interface AddToPlanBarProps {
  target: TargetPlan;
  /** Entries the target plan does not already cover; the button hides at zero. */
  unplannedCount: number;
  added: AddedToPlan | null;
  onAdd: () => void;
  onUndo: () => void;
}

/**
 * The "pick a Skill Plan, add the skills, undo" row Fit Check's Missing skills
 * popover and the industry skill-gate popover share. Renders nothing until the
 * Character's plans have loaded.
 */
export function AddToPlanBar({ target, unplannedCount, added, onAdd, onUndo }: AddToPlanBarProps) {
  const { t } = useTranslation();
  if (target.plans === undefined) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {added && (
        <span role="status" className="flex items-center gap-2 text-xs text-success">
          {t('skills.fitCheck.addedToast', {
            count: added.entries.length,
            plan: added.planName,
          })}
          <button type="button" className={inlineLinkClassName} onClick={onUndo}>
            {t('skills.fitCheck.addedToastUndo')}
          </button>
        </span>
      )}
      <TargetPlanPicker target={target} />
      {unplannedCount > 0 && (
        <Button size="sm" variant="primary" onClick={onAdd}>
          {target.plans.length === 0
            ? t('skills.fitCheck.createPlanAndAdd')
            : t('skills.fitCheck.addAllToPlan')}
        </Button>
      )}
    </div>
  );
}
