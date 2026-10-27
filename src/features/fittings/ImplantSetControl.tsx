/**
 * Which implants the Fitting's numbers assume, as one chip that names them
 * — "My clone", or the Fitting's own custom set — and opens the set's editor.
 * A Fitting that carries a set is stated on it (`defaultImplantBasis`, as
 * the workspace resolves `basis`); the editor's "Use my clone" drops the
 * set, which is the only way back.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Expanded } from '@/components/ui/icons';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { ImplantSetPicker } from './ImplantSetPicker';
import { StatField } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';
import { fieldBaseClassName, fieldSizeClassName } from '@/components/ui/controlStyles';

interface ImplantSetControlProps {
  /** What the stats are on, as the workspace resolved it. */
  basis: ImplantBasis;
  /** A Character is active, so there is a clone to go back to. */
  canUseCloneBasis: boolean;
  implantSet: FittingImplantSet | undefined;
  onImplantSetChange: (implantSet: FittingImplantSet | undefined) => void;
  /** The open Fitting and pilot, for the set editor's "Find by goal"; absent until the pilot loads. */
  fitting?: Fitting;
  profile?: PilotProfile | null;
}

export function ImplantSetControl({
  basis,
  canUseCloneBasis,
  implantSet,
  onImplantSetChange,
  fitting,
  profile,
}: ImplantSetControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const implants = implantSet?.implants.length ?? 0;
  const boosters = implantSet?.boosters.length ?? 0;
  const summary =
    basis === 'clone'
      ? t('fittings.implants.basis.clone')
      : implants + boosters === 0
        ? t('fittings.implants.none')
        : t('fittings.implants.custom', {
            implants: t('fittings.implants.implantCount', { count: implants }),
            boosters: t('fittings.implants.boosterCount', { count: boosters }),
          });

  const label = t('fittings.implants.label');
  return (
    <StatField label={label}>
      {/* Drawn as the selects beside it, though it opens the editor rather than a list. */}
      <button
        type="button"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between gap-1 ${fieldBaseClassName} ${fieldSizeClassName.sm} ${STAT_FIELD_WIDTH}`}
      >
        <span className="truncate">{summary}</span>
        <Expanded aria-hidden className="shrink-0 text-text-dim" />
      </button>
      <ImplantSetPicker
        open={open}
        onClose={() => setOpen(false)}
        implantSet={implantSet}
        onChange={onImplantSetChange}
        {...(canUseCloneBasis ? { onUseClone: () => onImplantSetChange(undefined) } : {})}
        {...(fitting && profile ? { finder: { fitting, profile, basis } } : {})}
      />
    </StatField>
  );
}
