/**
 * Improve's "Implants" section: the Implant Finder's best implants for the
 * active Improve Goal's stat, each at the grade that moves it most. They
 * cost the fit nothing, so they sit above the swaps. A row click puts the
 * implant in the Fitting's set, planned from the clone as Make it fit does.
 * Shown only when something helps; Best overall and Cheaper have no one stat
 * to chase, so no section.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import type { ImproveGoal } from '@/engine/fittings/improve';
import { IMPLANT_GOAL } from '@/engine/fittings/improveFree';
import { cloneSeedSet } from '@/engine/fittings/implantBasis';
import {
  displayValue,
  goalById,
  goalGain,
  placeAllInSet,
  type ImplantGoalId,
} from '@/engine/fittings/implantFinder';
import type { FittingImplantSet } from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { cx } from '@/lib/cx';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { fmt } from './implantFinderFormat';
import type { MakeItFitImplantsInput } from './MakeItFitImplants';
import { MakeItFitSection } from './MakeItFitSection';
import { useTargetProfiles } from './targetProfiles';
import { implantNames, useImplantFinder } from './useImplantFinder';

const EMPTY_SET: FittingImplantSet = { implants: [], boosters: [] };
const ROWS_SHOWN = 3;
const MIN_GAIN = 1e-4;

interface Props {
  goal: ImproveGoal;
  open: boolean;
  implants: MakeItFitImplantsInput;
  /** After an implant is put in the set, with its name. */
  onApplied: (names: string) => void;
}

export function ImproveImplants({ goal, ...rest }: Props) {
  const goalId = IMPLANT_GOAL[goal];
  if (!goalId) return null;
  return <Implants goalId={goalId} {...rest} />;
}

function Implants({
  goalId,
  open,
  implants,
  onApplied,
}: Omit<Props, 'goal'> & { goalId: ImplantGoalId }) {
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
  const goalDef = goalById(goalId);
  const { baseline, context } = finder;

  const rows = useMemo(() => {
    if (!baseline || finder.updating || !finder.results) return [];
    // One row per family: the grade that moves the goal most.
    return finder.results
      .flatMap((result) => {
        const graded = result.grades
          .filter((grade) => !grade.inSet)
          .map((grade) => ({ grade, gain: goalGain(goalDef, baseline, grade.stats, context) }));
        const best = graded.reduce<(typeof graded)[number] | null>(
          (top, row) => (top === null || row.gain > top.gain ? row : top),
          null
        );
        return best && best.gain > MIN_GAIN ? [best] : [];
      })
      .sort((a, b) => b.gain - a.gain)
      .slice(0, ROWS_SHOWN);
  }, [baseline, finder.updating, finder.results, goalDef, context]);

  if (finder.status === 'error' || rows.length === 0 || !baseline) return null;

  const set = fitting.implantSet ?? seed ?? EMPTY_SET;
  const unit = t(`fittings.implantFinder.unit.${goalId}`);
  const n = (value: number) => fmt(value, goalDef.display.decimals);

  return (
    <MakeItFitSection heading={t('fittings.improve.section.implants')}>
      <ul className="space-y-1">
        {rows.map(({ grade, gain }) => {
          const typeId = grade.grade.typeId;
          const name = names.get(typeId)?.full ?? `#${typeId}`;
          const before = displayValue(goalDef, baseline, context);
          const after = displayValue(goalDef, grade.stats, context);
          return (
            <li key={typeId} className="border-line rounded-xs border">
              <button
                type="button"
                className={cx(
                  'w-full rounded-xs p-2 text-left text-sm',
                  rowInteractiveClassName,
                  focusRingInsetClassName
                )}
                onClick={() => {
                  if (!finder.catalog) return;
                  onChange(placeAllInSet(set, finder.catalog.slotOf, [typeId]));
                  onApplied(name);
                }}
              >
                <p className="font-medium">{name}</p>
                <p className="text-text-dim text-xs">
                  {t('fittings.implantFinder.delta', {
                    before: n(before),
                    after: n(after),
                    unit,
                    pct: `+${fmt(gain * 100, 1)}%`,
                  })}
                </p>
                {grade.best && grade.best.cost !== null && (
                  <p className="text-xs">
                    {t('fittings.makeItFit.costs')} <IskAmount value={grade.best.cost} />
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </MakeItFitSection>
  );
}
