/**
 * Which implants the Fitting's numbers assume — "My clone" (the active
 * Character's) or "Fitting's" (the set saved with it) — as one chip that
 * says both what it is and what it's set to, opening the choice and the
 * set's editor. The Fittings route otherwise shows no Character identity,
 * so this reads the name straight from Dexie.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  type TabItem,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';
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
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const characterName = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  )?.name;

  // Without a Character (or its clone) there is only the Fitting's own set.
  const effective: ImplantBasis = canUseCloneBasis ? basis : 'fitting';
  const tabs: TabItem[] = [
    { id: 'clone', label: t('fittings.implants.basis.clone') },
    { id: 'fitting', label: t('fittings.implants.basis.fitting') },
  ];

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" className="whitespace-nowrap">
            <span className="text-text-dim">{t('fittings.implants.chipLabel')}</span>
            {t(`fittings.implants.basis.${effective}`)}
            <Expanded aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3">
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{t('fittings.implants.popoverTitle')}</p>
            {canUseCloneBasis && (
              <Tabs
                tabs={tabs}
                value={basis}
                onChange={(id) => onBasisChange(id as ImplantBasis)}
                label={t('fittings.implants.basis.label')}
              />
            )}
            <p className="text-xs text-text-dim">
              {effective === 'clone'
                ? t('fittings.implants.cloneExplain', { name: characterName ?? '' })
                : t('fittings.implants.fittingExplain')}
            </p>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                setPickerOpen(true);
              }}
            >
              {t('fittings.implants.editSet')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <ImplantSetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        implantSet={implantSet}
        onChange={onImplantSetChange}
      />
    </>
  );
}
