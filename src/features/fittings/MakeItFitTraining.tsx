/**
 * Make it fit's "Train" section: the skill levels that bring the Fitting
 * under budget with nothing swapped out (`useSkillFixes`, the run What to
 * train shares), each with its time and Add to plan. Only for the active
 * Character's real skills, as What to train is: under All 0 / All V or skill
 * overrides there is nothing of theirs to train.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner, Toast } from '@/components/ui';
import { hasSkillOverrides } from '@/engine/fittings/skillOverrides';
import type { PlanEntry } from '@/engine/types';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { SkillFixList } from './FittingSkillFixList';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillFixes } from './useSkillFixes';
import { usePlannedLevels, useTrainingSchedule } from './useTrainingSchedule';
import { MakeItFitSection } from './MakeItFitSection';

interface Props {
  open: boolean;
  evaluator: SkillGainEvaluator | null;
  characterId: number | null;
  /** Names the Skill Plan Add to plan creates when the Character has none yet. */
  fittingName: string;
}

export function MakeItFitTraining({ open, evaluator, characterId, fittingName }: Props) {
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  if (characterId === null || overridden) return null;
  return (
    // Keyed so an Undo toast can't outlive a Character switch.
    <Training
      key={characterId}
      open={open}
      evaluator={evaluator}
      characterId={characterId}
      fittingName={fittingName}
    />
  );
}

function Training({
  open,
  evaluator,
  characterId,
  fittingName,
}: Omit<Props, 'characterId'> & { characterId: number }) {
  const { t } = useTranslation();
  const { fixes, failed } = useSkillFixes(evaluator, open);
  const target = useTargetPlan(characterId);
  const { catalog, trainedSkills, trainedSkillsKnown, scheduleEntriesFor } =
    useTrainingSchedule(characterId);
  const targetPlan = target.plans?.find((plan) => plan.id === target.targetPlanId);
  const plannedLevels = usePlannedLevels(targetPlan, catalog, trainedSkills, trainedSkillsKnown);
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);

  // A failed run or no training that fits says nothing: the other sections still can.
  if (failed || (fixes !== null && fixes.length === 0)) return null;

  async function add(entries: readonly PlanEntry[]) {
    const result = await target.addEntries(entries, fittingName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <MakeItFitSection heading={t('fittings.makeItFit.section.train')}>
      {fixes === null ? (
        <p className="text-text-dim flex items-center gap-2 text-xs">
          <Spinner /> {t('fittings.makeItFit.checkingSkills')}
        </p>
      ) : (
        <SkillFixList
          fixes={fixes}
          skillName={(id) => catalog?.engineSkills.get(id)?.name ?? `#${id}`}
          scheduleEntriesFor={scheduleEntriesFor}
          plan={target.plans === undefined ? undefined : (targetPlan ?? null)}
          plannedLevels={plannedLevels}
          onAdd={(entries) => void add(entries)}
        />
      )}
      {added && (
        <Toast
          message={t('skills.fitCheck.addedToast', {
            count: added.entries.length,
            plan: added.planName,
          })}
          undo={{
            label: t('skills.fitCheck.addedToastUndo'),
            onUndo: () => {
              void target.removeEntries(added.planId, added.entries);
              setAdded(null);
            },
          }}
          onClose={() => setAdded(null)}
        />
      )}
    </MakeItFitSection>
  );
}
