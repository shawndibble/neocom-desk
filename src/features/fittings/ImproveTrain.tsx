/**
 * Improve's "Train" section: the skill levels and the Tech II modules the
 * pilot can't fly yet that most raise the active Improve Goal's stat, from
 * What to train's own runs (`useSkillGains`, `useModuleUpgrades`). They cost
 * the fit nothing, so they sit above the swaps. Only for the active
 * Character's real skills, and only when something helps.
 */
import { useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Caret, textActionClassName, Toast } from '@/components/ui';
import { ImproveSkillsSlotContext } from './improveSkillsSlot';
import type { ImproveGoal } from '@/engine/fittings/improve';
import { FREE_ROWS_SHOWN, TRAIN_SORT } from '@/engine/fittings/improveFree';
import { rankModuleUpgrades } from '@/engine/fittings/moduleUpgrades';
import { rankSkillGains } from '@/engine/fittings/skillGains';
import { hasSkillOverrides } from '@/engine/fittings/skillOverrides';
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import { ModuleUpgradeItem } from './FittingModuleUpgrades';
import { WhatToTrainItem, type WhatToTrainRow } from './FittingWhatToTrainPanel';
import { MakeItFitSection } from './MakeItFitSection';
import { useSkillOverrides } from './statsConditions';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useModuleUpgrades } from './useModuleUpgrades';
import { useSkillGains } from './useSkillGains';
import { usePlannedLevels, useTrainingSchedule } from './useTrainingSchedule';

interface Props {
  goal: ImproveGoal;
  evaluator: SkillGainEvaluator | null;
  characterId: number | null;
  /** Names the Skill Plan Add to plan creates when the Character has none yet. */
  fittingName: string;
  catalogue: FittingCatalogue | null;
}

export function ImproveTrain({ goal, characterId, ...rest }: Props) {
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  const sort = TRAIN_SORT[goal];
  if (characterId === null || overridden || !sort) return null;
  // Keyed so an Undo toast can't outlive a Character switch.
  return <Train key={characterId} characterId={characterId} goal={goal} {...rest} />;
}

function Train({
  goal,
  evaluator,
  characterId,
  fittingName,
  catalogue,
}: Props & { characterId: number }) {
  const { t } = useTranslation();
  const sort = TRAIN_SORT[goal]!;
  const target = useTargetPlan(characterId);
  const { gains } = useSkillGains(evaluator);
  const { catalog, trainedSkills, trainedSkillsKnown, scheduleEntriesFor } =
    useTrainingSchedule(characterId);
  const upgrades = useModuleUpgrades(evaluator, catalogue, scheduleEntriesFor);
  const targetPlan = target.plans?.find((plan) => plan.id === target.targetPlanId);
  const plannedLevels = usePlannedLevels(targetPlan, catalog, trainedSkills, trainedSkillsKnown);
  const slot = useContext(ImproveSkillsSlotContext);
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);

  const skills = useMemo((): WhatToTrainRow[] => {
    const rows = (gains ?? []).map((gain) => ({
      ...gain,
      name: catalog?.engineSkills.get(gain.skillTypeId)?.name ?? `#${gain.skillTypeId}`,
    }));
    return rankSkillGains(rows, sort)
      .filter((row) => row.metrics[sort] > 0)
      .slice(0, FREE_ROWS_SHOWN);
  }, [gains, catalog, sort]);
  const modules = useMemo(
    () =>
      rankModuleUpgrades(upgrades.rows ?? [], sort)
        .filter((row) => row.metrics[sort] > 0)
        .slice(0, FREE_ROWS_SHOWN),
    [upgrades.rows, sort]
  );

  if (!evaluator || skills.length + modules.length === 0) return null;

  async function addEntries(entries: readonly PlanEntry[]) {
    const result = await target.addEntries(entries, fittingName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }
  const plan = target.plans === undefined ? undefined : (targetPlan ?? null);
  const scheduleFor = (skillTypeId: number, level: number): readonly ScheduledStep[] | null =>
    scheduleEntriesFor?.([{ skillTypeID: skillTypeId, targetLevel: level }]) ?? null;

  const rows = (
    <ul className="m-0 list-none p-0 text-xs">
      {skills.map((row, index) => (
        <WhatToTrainItem
          key={row.skillTypeId}
          row={row}
          rank={index + 1}
          evaluator={evaluator}
          plan={plan}
          plannedLevels={plannedLevels}
          scheduleFor={scheduleFor}
          skills={catalog?.engineSkills}
          trainedSkills={trainedSkills}
          onAdd={(picked, level) =>
            addEntries([{ skillTypeID: picked.skillTypeId, targetLevel: level }])
          }
        />
      ))}
      {modules.map((row) => (
        <ModuleUpgradeItem
          key={row.fromTypeId}
          row={row}
          typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
          skills={catalog?.engineSkills}
          trainedSkills={trainedSkills}
          plan={plan}
          plannedLevels={plannedLevels}
          onAdd={addEntries}
        />
      ))}
    </ul>
  );
  const toast = added && (
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
  );
  // Inside Improve's header: a Skills control with a count, its rows only while it is open.
  if (slot) {
    const count = skills.length + modules.length;
    return (
      <>
        {slot.trigger &&
          createPortal(
            <button
              type="button"
              className={textActionClassName('gap-1')}
              aria-expanded={slot.open}
              aria-controls={slot.panelId}
              aria-label={`${t('fittings.improve.skills')}, ${t('fittings.improve.skillsCount', { count })}`}
              onClick={slot.onToggle}
            >
              {t('fittings.improve.skills')}
              <span
                aria-hidden="true"
                className="bg-accent/20 text-accent rounded-full px-1.5 text-xs normal-case tracking-normal"
              >
                {count}
              </span>
              <Caret expanded={slot.open} />
            </button>,
            slot.trigger
          )}
        {slot.open && slot.panel && createPortal(rows, slot.panel)}
        {toast}
      </>
    );
  }
  return (
    <MakeItFitSection heading={t('fittings.improve.section.train')}>
      {rows}
      {toast}
    </MakeItFitSection>
  );
}
