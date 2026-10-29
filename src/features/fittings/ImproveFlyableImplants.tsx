/**
 * Make Flyable's implant alternative: for a fix that ran the fit out of CPU or
 * powergrid, the cheapest implants that bring it back under, found by the
 * Implant Finder on the Fitting as the fix leaves it. It sits beside the
 * module and rig swaps that pay for the same fix, so the pilot picks the
 * cheaper or easier to get. Only a set within the pilot's budget is offered;
 * a click makes the fix and puts the implants in the Fitting's set, together.
 * Calibration is not moved by any implant, so a fix over only that has none.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, Spinner } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { overIskBudget, type RejectedOption } from '@/engine/fittings/improve';
import { cloneSeedSet } from '@/engine/fittings/implantBasis';
import { placeAllInSet, type ImplantGoalId } from '@/engine/fittings/implantFinder';
import { overageOf } from '@/engine/fittings/makeItFit';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { cx } from '@/lib/cx';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { MakeItFitImplantsInput } from './MakeItFitImplants';
import { useTargetProfiles } from './targetProfiles';
import { implantNames, useImplantFinder } from './useImplantFinder';

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };
const FIX_LIMIT = 2;

interface Props {
  /** The fix as it overran: its fitting is the one the implants are found for. */
  fix: RejectedOption;
  /** The fix's own name, for the row. */
  label: string;
  open: boolean;
  implants: MakeItFitImplantsInput;
  iskBudget: number | null;
  fitTotal: number | null;
  /** Makes the fix and sets the implants, as one edit. */
  onApply: (fix: RejectedOption, implantSet: FittingImplantSet) => void;
}

export function ImproveFlyableImplants(props: Props) {
  // Implants move CPU and powergrid, never calibration.
  const goalId: ImplantGoalId | null =
    overageOf(props.fix.after, 'cpu') > 0
      ? 'cpu'
      : overageOf(props.fix.after, 'powergrid') > 0
        ? 'powergrid'
        : null;
  if (goalId === null) return null;
  return <Implants {...props} goalId={goalId} />;
}

function Implants({
  fix,
  label,
  open,
  implants,
  iskBudget,
  fitTotal,
  onApply,
  goalId,
}: Props & { goalId: ImplantGoalId }) {
  const { t } = useTranslation();
  const { profile, basis } = implants;
  const hubId = useMarketHub((state) => state.value);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { selected: target } = useTargetProfiles();
  const seed = useMemo(
    () => cloneSeedSet(basis, fix.fitting.implantSet, profile.implantTypeIds),
    [basis, fix.fitting.implantSet, profile.implantTypeIds]
  );
  // Stable per fix and seed: the finder re-screens every family whenever this changes.
  const planned = useMemo(
    () => (seed ? { ...fix.fitting, implantSet: seed } : fix.fitting),
    [fix.fitting, seed]
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
  // The implants are bought on top of the fix, so the budget covers both.
  const fixes = finder.fixes
    .filter((found) => fitsResourceBudget(found.stats))
    .filter((found) => !overIskBudget(iskBudget, fitTotal, fix.iskDelta, found.cost))
    .slice(0, FIX_LIMIT);
  const searching = finder.status === 'loading' || finder.updating;

  if (finder.status === 'error' || (!searching && fixes.length === 0)) return null;

  const set = fix.fitting.implantSet ?? seed ?? EMPTY_SET;
  return (
    <div className="space-y-1" data-testid="improve-flyable-implants">
      <p className="text-text-dim text-xs">
        {t('fittings.improve.flyableImplants', { fix: label })}
      </p>
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
          {fixes.map((found) => (
            <li key={found.typeIds.join()} className="border-line rounded-xs border">
              <button
                type="button"
                className={cx(
                  'w-full rounded-xs p-2 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName
                )}
                onClick={() =>
                  finder.catalog &&
                  onApply(fix, placeAllInSet(set, finder.catalog.slotOf, found.typeIds))
                }
              >
                {found.typeIds.map((id) => (
                  <p key={id} className="font-medium">
                    {names.get(id)?.full ?? `#${id}`}
                  </p>
                ))}
                <p className="mt-0.5 text-xs">
                  {t('fittings.makeItFit.costs')} <IskAmount value={found.cost} />
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
