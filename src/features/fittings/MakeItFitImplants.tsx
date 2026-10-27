/**
 * Make it fit's "Implants" section: the cheapest implants that bring the
 * Fitting under budget, found by the Implant Finder's own run on the budget
 * the pilot clicked "Fix" on (no implant moves calibration, so that one has no
 * section). Only a fix that brings the whole Fitting under — every budget,
 * not just this one — is offered. A row click puts the implants in the
 * Fitting's set, planned from the clone as the set editor plans (`cloneSeedSet`).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, Spinner } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cloneSeedSet, type ImplantBasis } from '@/engine/fittings/implantBasis';
import { placeAllInSet } from '@/engine/fittings/implantFinder';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { cx } from '@/lib/cx';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { FitResource } from './makeItFitContext';
import { MakeItFitSection } from './MakeItFitSection';
import { useTargetProfiles } from './targetProfiles';
import { implantNames, useImplantFinder } from './useImplantFinder';

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };
const FIX_LIMIT = 3;

export interface MakeItFitImplantsInput {
  fitting: Fitting;
  profile: PilotProfile;
  basis: ImplantBasis;
  onChange: (implantSet: FittingImplantSet) => void;
}

interface Props {
  open: boolean;
  resource: FitResource | null;
  implants: MakeItFitImplantsInput;
  /** After a fix is put in the set, with the implants' names. */
  onApplied: (names: string) => void;
}

export function MakeItFitImplants({ open, resource, implants, onApplied }: Props) {
  if (resource !== 'cpu' && resource !== 'powergrid') return null;
  return <Implants open={open} goalId={resource} implants={implants} onApplied={onApplied} />;
}

function Implants({
  open,
  goalId,
  implants,
  onApplied,
}: Omit<Props, 'resource'> & { goalId: 'cpu' | 'powergrid' }) {
  const { t } = useTranslation();
  const { fitting, profile, basis, onChange } = implants;
  const hubId = useMarketHub((state) => state.value);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { selected: target } = useTargetProfiles();
  const seed = useMemo(
    () => cloneSeedSet(basis, fitting.implantSet, profile.implantTypeIds),
    [basis, fitting.implantSet, profile.implantTypeIds]
  );
  // Stable per Fitting and seed: the finder re-screens every family whenever this changes.
  const planned = useMemo(
    () => (seed ? { ...fitting, implantSet: seed } : fitting),
    [fitting, seed]
  );
  const finder = useImplantFinder({
    open,
    fitting: planned,
    profile,
    goalId,
    hubId,
    characterId,
    target,
  });
  const names = useMemo(() => implantNames(finder.catalog?.families ?? []), [finder.catalog]);
  const fixes = finder.fixes.filter((fix) => fitsResourceBudget(fix.stats)).slice(0, FIX_LIMIT);
  const searching = finder.status === 'loading' || finder.updating;

  if (finder.status === 'error' || (!searching && fixes.length === 0)) return null;

  const set = fitting.implantSet ?? seed ?? EMPTY_SET;
  function apply(typeIds: readonly number[]) {
    if (!finder.catalog) return;
    onChange(placeAllInSet(set, finder.catalog.slotOf, typeIds));
    onApplied(typeIds.map((id) => names.get(id)?.full ?? `#${id}`).join(', '));
  }

  return (
    <MakeItFitSection heading={t('fittings.makeItFit.section.implants')}>
      {searching ? (
        <p className="text-text-dim flex items-center gap-2 text-xs">
          <Spinner />{' '}
          {t('fittings.makeItFit.checkingImplants', {
            done: finder.progress.done,
            total: finder.progress.total,
          })}
        </p>
      ) : (
        <ul className="space-y-1">
          {fixes.map((fix) => (
            <li key={fix.typeIds.join()} className="border-line rounded-xs border">
              <button
                type="button"
                className={cx(
                  'w-full rounded-xs p-2 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName
                )}
                onClick={() => apply(fix.typeIds)}
              >
                {fix.typeIds.map((id) => (
                  <p key={id} className="font-medium">
                    {names.get(id)?.full ?? `#${id}`}
                  </p>
                ))}
                <p className="mt-0.5 text-xs">
                  {t('fittings.makeItFit.costs')} <IskAmount value={fix.cost} />
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MakeItFitSection>
  );
}
