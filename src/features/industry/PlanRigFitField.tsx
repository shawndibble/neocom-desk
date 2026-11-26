import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui';
import {
  type FacilityKind,
  type RigFit,
  type RigKind,
  type SecurityBand,
} from '@/engine/industry/types';
import { RigKindOptions } from './RigKindOptions';
import { RigMatchHelper } from './RigMatchHelper';

interface PlanRigFitFieldProps {
  fit: RigFit;
  facility: FacilityKind;
  security: SecurityBand;
  onSlotChange: (slot: number, kind: RigKind) => void;
  onApplyFit: (fit: RigFit) => void;
}

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
          <label key={slot} className="flex flex-col gap-1">
            <span className="sr-only">{t('industry.rigSlotLabel', { slot: slot + 1 })}</span>
            <Select value={kind} onValueChange={(value) => onSlotChange(slot, value as RigKind)}>
              <SelectTrigger aria-label={t('industry.rigSlotLabel', { slot: slot + 1 })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <RigKindOptions />
              </SelectContent>
            </Select>
          </label>
        ))}
        <RigMatchHelper facility={facility} security={security} onApply={onApplyFit} />
      </div>
    </div>
  );
}
