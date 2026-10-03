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
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { ImplantSetPicker } from './ImplantSetPicker';
import { StatField } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';
import { fieldBaseClassName, fieldSizeClassName } from '@/components/ui/controlStyles';

interface ImplantBasisControlProps {
  basis: ImplantBasis;
  canUseCloneBasis: boolean;
  onBasisChange: (basis: ImplantBasis) => void;
  implantSet: FittingImplantSet | undefined;
  onImplantSetChange: (implantSet: FittingImplantSet | undefined) => void;
  /** The open Fitting and pilot, for the set editor's "Find by goal"; absent until the pilot loads. */
  fitting?: Fitting;
  profile?: PilotProfile | null;
}

export function ImplantBasisControl({
  basis,
  canUseCloneBasis,
  onBasisChange,
  implantSet,
  onImplantSetChange,
  fitting,
  profile,
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

  const label = t('fittings.implants.label');
  return (
    <StatField label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* Drawn as the select beside it: it picks one of two, then opens the set. */}
          <button
            type="button"
            aria-label={`${label}: ${t(`fittings.implants.basis.${effective}`)}`}
            className={`flex items-center justify-between gap-1 ${fieldBaseClassName} ${fieldSizeClassName.sm} ${STAT_FIELD_WIDTH}`}
          >
            <span className="truncate">{t(`fittings.implants.basis.${effective}`)}</span>
            <Expanded aria-hidden className="shrink-0 text-text-dim" />
          </button>
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
                ? characterName
                  ? t('fittings.implants.cloneExplain', { name: characterName })
                  : t('fittings.implants.cloneExplainNoName')
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
        {...(fitting && profile ? { finder: { fitting, profile, basis: effective } } : {})}
      />
    </StatField>
  );
}
