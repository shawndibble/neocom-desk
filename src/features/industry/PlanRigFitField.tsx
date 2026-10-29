import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import {
  RIG_KIND_OPTIONS,
  type FacilityKind,
  type RigFit,
  type RigKind,
  type SecurityBand,
} from '@/engine/industry/types';
import { rigKindLabelKey } from './rigFitLabels';
import { RigMatchHelper } from './RigMatchHelper';

interface PlanRigFitFieldProps {
  /** The three fitted rigs, already resolved from the plan. */
  fit: RigFit;
  facility: FacilityKind;
  security: SecurityBand;
  onSlotChange: (slot: number, kind: RigKind) => void;
  onApplyFit: (fit: RigFit) => void;
}

/** One structure's rig slots, plus the helper that fits rigs to a hull's bonus. Shared by the Build and Reaction locations. */
export function PlanRigFitField({
  fit,
  facility,
  security,
  onSlotChange,
  onApplyFit,
}: PlanRigFitFieldProps) {
  const { t } = useTranslation();
  return (
    <div className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-3">
      <span>{t('industry.rigFitLabel')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {fit.map((kind, slot) => (
          // A slot's position is its identity, not the kind
          // fitted in it, so the index is a stable key.
          <label key={slot} className="flex flex-col gap-1">
            <span className="sr-only">{t('industry.rigSlotLabel', { slot: slot + 1 })}</span>
            <Select value={kind} onValueChange={(value) => onSlotChange(slot, value as RigKind)}>
              <SelectTrigger aria-label={t('industry.rigSlotLabel', { slot: slot + 1 })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RIG_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(rigKindLabelKey(option))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
        <RigMatchHelper facility={facility} security={security} onApply={onApplyFit} />
      </div>
    </div>
  );
}
