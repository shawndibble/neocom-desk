/**
 * "My clone" vs "Fitting's" (issue #1535): the active basis is always
 * labelled via `Tabs`'s own selected-state styling, and the edit-set button
 * that opens `ImplantSetPicker` sits right beside it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tabs, type TabItem } from '@/components/ui';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { ImplantSetPicker } from './ImplantSetPicker';

interface ImplantBasisControlProps {
  basis: ImplantBasis;
  canUseCloneBasis: boolean;
  onBasisChange: (basis: ImplantBasis) => void;
  implantSet: FittingImplantSet | undefined;
  onImplantSetChange: (implantSet: FittingImplantSet | undefined) => void;
}

export function ImplantBasisControl({
  basis,
  canUseCloneBasis,
  onBasisChange,
  implantSet,
  onImplantSetChange,
}: ImplantBasisControlProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const tabs: TabItem[] = [
    { id: 'clone', label: t('fittings.implants.basis.clone') },
    { id: 'fitting', label: t('fittings.implants.basis.fitting') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-text-dim">{t('fittings.implants.basis.label')}</span>
      {canUseCloneBasis ? (
        <Tabs
          tabs={tabs}
          value={basis}
          onChange={(id) => onBasisChange(id as ImplantBasis)}
          label={t('fittings.implants.basis.label')}
        />
      ) : (
        <span className="font-medium">{t('fittings.implants.basis.fitting')}</span>
      )}
      <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
        {t('fittings.implants.editSet')}
      </Button>
      <ImplantSetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        implantSet={implantSet}
        onChange={onImplantSetChange}
      />
    </div>
  );
}
