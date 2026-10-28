/**
 * Improve's "Implants" line: how many of the Implant Finder's implants would
 * raise the active Improve Goal's stat, the best of them, and a link into the
 * Finder to pick. They cost the fit nothing, so they stay out of its total.
 * Shown only when something helps; Best overall and Cheaper have no one stat
 * to chase, so no line.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import type { ImproveGoal } from '@/engine/fittings/improve';
import { IMPLANT_GOAL } from '@/engine/fittings/improveFree';
import { cloneSeedSet } from '@/engine/fittings/implantBasis';
import { goalById, goalGain, type ImplantGoalId } from '@/engine/fittings/implantFinder';
import { useMarketHub } from '@/features/market/hub';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { fmt } from './implantFinderFormat';
import type { MakeItFitImplantsInput } from './MakeItFitImplants';
import { ImplantSetPicker } from './ImplantSetPicker';
import { useTargetProfiles } from './targetProfiles';
import { implantNames, useImplantFinder } from './useImplantFinder';

const MIN_GAIN = 1e-4;

interface Props {
  goal: ImproveGoal;
  open: boolean;
  implants: MakeItFitImplantsInput;
}

export function ImproveImplants({ goal, ...rest }: Props) {
  const goalId = IMPLANT_GOAL[goal];
  if (!goalId) return null;
  return <Implants goalId={goalId} {...rest} />;
}

function Implants({ goalId, open, implants }: Omit<Props, 'goal'> & { goalId: ImplantGoalId }) {
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
  const [picking, setPicking] = useState(false);

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
      .sort((a, b) => b.gain - a.gain);
  }, [baseline, finder.updating, finder.results, goalDef, context]);

  if (finder.status === 'error' || rows.length === 0 || !baseline) return null;

  const top = rows[0];
  const topName = names.get(top.grade.grade.typeId)?.full ?? `#${top.grade.grade.typeId}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
      <p>
        <span className="font-medium">{t('fittings.improve.section.implants')}</span>
        <span className="text-text-dim">
          {' · '}
          {t('fittings.improve.implantsHelp', { count: rows.length })}
          {` (${topName} +${fmt(top.gain * 100, 1)}%)`}
        </span>
      </p>
      <button type="button" className={textActionClassName()} onClick={() => setPicking(true)}>
        {t('fittings.improve.findImplants')}
      </button>
      <ImplantSetPicker
        open={picking}
        onClose={() => setPicking(false)}
        implantSet={fitting.implantSet}
        onChange={(next) => next && onChange(next)}
        finder={{ fitting, profile, basis }}
      />
    </div>
  );
}
