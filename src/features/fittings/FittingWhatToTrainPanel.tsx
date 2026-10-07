/**
 * "What to train": which skill most improves the open Fitting, each with its
 * whole-Fitting changes and the time to train it at the Character's
 * attributes and implants (the same schedule a Skill Plan uses —
 * prerequisites included, and listed on click). Only for the active
 * Character's real skills: under All 0 / All V or single-skill overrides a
 * "+1" would build on levels the pilot doesn't have.
 *
 * Each skill name opens the shared skill detail modal, read against the
 * target Skill Plan.
 *
 * Skills are ranked at their next level, but each row has a level picker:
 * the changes and time follow the level picked, worked out on demand. Levels
 * the pilot has are not offered; levels a Skill Plan already trains are shown
 * grayed out. "Add to plan" puts the picked level into the picked Skill Plan
 * (a new one named after the Fitting if the Character has none): the levels
 * below it and any missing prerequisites are the plan's own derived rows,
 * scheduled ahead of it by the same normalizer the Skill Plan editor runs, so
 * Undo takes back exactly the one entry and what it pulled in goes with it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  buttonClassName,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toast,
} from '@/components/ui';
import {
  GAIN_METRICS,
  levelOptions,
  pickedLevel,
  rankSkillGains,
  scheduledSkillTargets,
  trainingTimeFor,
  type GainSort,
  type SkillGain,
} from '@/engine/fittings/skillGains';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { hasSkillOverrides } from '@/engine/fittings/skillOverrides';
import { normalizePlan } from '@/engine/plan';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { SkillLink } from '@/features/entities';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { WhatToTrainPrerequisites } from './FittingWhatToTrainPrerequisites';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';
import { useSkillLevelGain } from './useSkillLevelGain';
import { ModuleUpgradeList } from './FittingModuleUpgrades';
import { gainChangeLabels } from './whatToTrainChanges';
import { useModuleUpgrades, type ScheduleEntries } from './useModuleUpgrades';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import { rankModuleUpgrades } from '@/engine/fittings/moduleUpgrades';
import type { SkillPlanRecord } from '@/db';
import { StatField, StatFields, StatNote } from './StatFacts';
import { STAT_DETAIL, STAT_FIELD_WIDTH, joinDetail, statRowClassName } from './statKit';
import { useTimedToast } from '@/components/ui/useTimedToast';

interface WhatToTrainRow extends SkillGain {
  name: string;
}

export interface FittingWhatToTrainPanelProps {
  evaluator: SkillGainEvaluator | null;
  /** The active Character; null shows why there's nothing to rank. */
  characterId: number | null;
  /** Names the Skill Plan "Add to plan" creates when the Character has none yet. */
  fittingName: string;
  /** Module names, racks and variations, for the Tech II upgrades; null while loading. */
  catalogue: FittingCatalogue | null;
}

export function FittingWhatToTrainPanel({
  evaluator,
  characterId,
  fittingName,
  catalogue,
}: FittingWhatToTrainPanelProps) {
  const { t } = useTranslation();
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  if (characterId === null) return <StatNote>{t('fittings.whatToTrain.noCharacter')}</StatNote>;
  if (overridden) return <StatNote>{t('fittings.whatToTrain.overridesOn')}</StatNote>;
  return (
    // Keyed so an Undo toast can't outlive a Character switch and sync the wrong pilot.
    <WhatToTrainRanking
      key={characterId}
      evaluator={evaluator}
      characterId={characterId}
      fittingName={fittingName}
      catalogue={catalogue}
    />
  );
}

function WhatToTrainRanking({
  evaluator,
  characterId,
  fittingName,
  catalogue,
}: {
  evaluator: SkillGainEvaluator | null;
  characterId: number;
  fittingName: string;
  catalogue: FittingCatalogue | null;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<GainSort>('overall');
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);
  const target = useTargetPlan(characterId);
  useTimedToast(added, () => setAdded(null));
  const { gains, loading, failed } = useSkillGains(evaluator);
  const { catalog, trainedSkills, trainedSkillsKnown, attributes, implants } =
    usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);
  const cloneState = cloneStateFor(cloneStates, characterId);

  // Worked out once per result, not per sort change.
  const rows = useMemo((): WhatToTrainRow[] | null => {
    if (gains === null) return null;
    return gains.map((gain) => ({
      ...gain,
      name: catalog?.engineSkills.get(gain.skillTypeId)?.name ?? `#${gain.skillTypeId}`,
    }));
  }, [gains, catalog]);
  // The schedule for some skill levels; null before the Character's skills are in,
  // or every row would time from level 0.
  const scheduleEntriesFor = useMemo(
    (): ScheduleEntries | null =>
      catalog && trainedSkillsKnown
        ? (entries) =>
            scheduleEntries(entries, {
              skills: catalog.engineSkills,
              trainedSkills,
              attributes,
              implants,
              cloneState,
            })
        : null,
    [catalog, trainedSkills, trainedSkillsKnown, attributes, implants, cloneState]
  );
  const scheduleFor = useCallback(
    (skillTypeId: number, level: number): readonly ScheduledStep[] | null =>
      scheduleEntriesFor?.([{ skillTypeID: skillTypeId, targetLevel: level }]) ?? null,
    [scheduleEntriesFor]
  );
  const upgrades = useModuleUpgrades(evaluator, catalogue, scheduleEntriesFor);
  // Only the stats some suggestion moves: a mining sort on a warship would rank nothing.
  const sorts = useMemo(
    (): GainSort[] => [
      'overall',
      ...GAIN_METRICS.filter((metric) =>
        [...(rows ?? []), ...(upgrades.rows ?? [])].some((row) => row.metrics[metric] !== 0)
      ),
    ],
    [rows, upgrades.rows]
  );
  const activeSort = sorts.includes(sort) ? sort : 'overall';
  const ranked = useMemo(
    () => (rows === null ? null : rankSkillGains(rows, activeSort)),
    [rows, activeSort]
  );
  const rankedUpgrades = useMemo(
    () => (upgrades.rows === null ? null : rankModuleUpgrades(upgrades.rows, activeSort)),
    [upgrades.rows, activeSort]
  );

  const targetPlan = target.plans?.find((plan) => plan.id === target.targetPlanId);
  // Highest level the target plan trains each skill to — its derived
  // prerequisite rows included, so a level it already trains on the way to
  // another entry isn't offered again as a redundant entry.
  const plannedLevels = useMemo(() => {
    const levels = new Map<number, number>();
    if (!targetPlan) return levels;
    const raise = (skillTypeID: number, level: number) =>
      levels.set(skillTypeID, Math.max(levels.get(skillTypeID) ?? 0, level));
    for (const entry of targetPlan.entries) raise(entry.skillTypeID, entry.targetLevel);
    // Not before the Character's skills are in, or every prerequisite would count as untrained.
    if (!catalog || !trainedSkillsKnown) return levels;
    try {
      const known = targetPlan.entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
      for (const step of normalizePlan(known, catalog.engineSkills, trainedSkills)) {
        raise(step.skillTypeID, step.level);
      }
    } catch {
      // A circular plan is the Skill Plan editor's to report; its entries still count.
    }
    return levels;
  }, [targetPlan, catalog, trainedSkills, trainedSkillsKnown]);

  if (evaluator === null || loading)
    return <StatNote>{t('fittings.whatToTrain.loading')}</StatNote>;
  if (failed || ranked === null) return <StatNote>{t('fittings.whatToTrain.failed')}</StatNote>;

  async function addEntries(entries: readonly PlanEntry[]) {
    const result = await target.addEntries(entries, fittingName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }
  const add = (row: WhatToTrainRow, level: number) =>
    addEntries([{ skillTypeID: row.skillTypeId, targetLevel: level }]);
  const plan = target.plans === undefined ? undefined : (targetPlan ?? null);

  const rankByLabel = t('fittings.whatToTrain.rankBy');
  return (
    <div className="space-y-3">
      <StatFields>
        <StatField label={rankByLabel}>
          <Select
            value={activeSort}
            onValueChange={(value) => {
              const picked = sorts.find((option) => option === value);
              if (picked) setSort(picked);
            }}
          >
            <SelectTrigger aria-label={rankByLabel} size="sm" className={STAT_FIELD_WIDTH}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`fittings.whatToTrain.sort.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            to={targetPlan ? `/skills/plans/${targetPlan.id}` : '/skills/plans'}
            className={buttonClassName({ size: 'sm' })}
          >
            {t('fittings.whatToTrain.openPlan')}
          </Link>
        </StatField>
        {/* Only with a plan to choose between (`TargetPlanPicker`). */}
        {target.plans && target.plans.length > 1 && (
          <StatField label={t('skills.targetPlan.label')}>
            <TargetPlanPicker target={target} bare className={STAT_FIELD_WIDTH} />
          </StatField>
        )}
      </StatFields>
      {/* Only once no Tech II upgrade is left to suggest either: else it reads as "nothing to train". */}
      {ranked.length === 0 && rankedUpgrades?.length === 0 && (
        <StatNote>{t('fittings.whatToTrain.none')}</StatNote>
      )}
      {ranked.length > 0 && (
        <ul
          aria-label={t('fittings.stats.section.whatToTrain')}
          className="m-0 list-none p-0 text-xs"
        >
          {ranked.map((row, index) => (
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
              onAdd={add}
            />
          ))}
        </ul>
      )}
      <ModuleUpgradeList
        rows={rankedUpgrades}
        typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
        skills={catalog?.engineSkills}
        trainedSkills={trainedSkills}
        plan={plan}
        plannedLevels={plannedLevels}
        onAdd={addEntries}
      />
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
        />
      )}
    </div>
  );
}

interface WhatToTrainItemProps {
  row: WhatToTrainRow;
  rank: number;
  evaluator: SkillGainEvaluator;
  /** The target Skill Plan; null when the Character has none yet, undefined while plans load. */
  plan: SkillPlanRecord | null | undefined;
  /** The highest level the plan trains each skill to, prerequisite rows included. */
  plannedLevels: ReadonlyMap<number, number>;
  scheduleFor: (skillTypeId: number, level: number) => readonly ScheduledStep[] | null;
  skills: ReadonlyMap<number, EngineSkill> | undefined;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onAdd: (row: WhatToTrainRow, level: number) => Promise<void>;
}

/** The levels `from`..`to` as "III" or "I–III". */
function levelSpan(from: number, to: number): string {
  return from === to ? romanLevel(from) : `${romanLevel(from)}–${romanLevel(to)}`;
}

/**
 * One suggestion: the skill and what it changes on the left, the time it
 * takes at the top right; beneath, the plan it is already in, then a level
 * picker beside Add to plan. The changes and the time follow the level picked.
 */
function WhatToTrainItem({
  row,
  rank,
  evaluator,
  plan,
  plannedLevels,
  scheduleFor,
  skills,
  trainedSkills,
  onAdd,
}: WhatToTrainItemProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number | null>(null);
  const plannedThrough = plannedLevels.get(row.skillTypeId) ?? 0;
  const options = levelOptions(row.fromLevel, plannedThrough);
  const level = pickedLevel(options, picked);
  // Every level in a plan: what the whole skill would give, not a level to pick.
  const shownLevel = level ?? 5;
  const { gain, failed } = useSkillLevelGain(evaluator, row, shownLevel);
  const scheduled = scheduleFor(row.skillTypeId, shownLevel);
  const time = scheduled ? trainingTimeFor(scheduled, row.skillTypeId) : null;
  const prerequisiteRows =
    scheduled && skills
      ? buildFitCheckRows(scheduledSkillTargets(scheduled), skills, trainedSkills, scheduled)
      : [];
  const skill = `${row.name} ${romanLevel(shownLevel)}`;
  const plannedSpan =
    plan && plannedThrough > row.fromLevel
      ? levelSpan(row.fromLevel + 1, Math.min(plannedThrough, 5))
      : null;
  const changeCount = gain ? gain.delta.changes.length + gain.roleChanges.length : 0;
  const changes = failed
    ? [t('fittings.whatToTrain.levelFailed')]
    : gain === null
      ? [t('common.loading')]
      : changeCount === 0
        ? [t('fittings.whatToTrain.noChange')]
        : gainChangeLabels(gain, t);
  const canAdd = plan !== undefined && level !== null;

  return (
    <li className={statRowClassName()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-text-dim tabular-nums">{rank}</span>
            <SkillLink
              typeId={row.skillTypeId}
              planEntries={plan?.entries}
              className="min-w-0 font-semibold"
            >
              {row.name}
            </SkillLink>
          </span>
          <p className={STAT_DETAIL}>
            {joinDetail([
              row.fromLevel > 0
                ? t('fittings.whatToTrain.trained', { level: romanLevel(row.fromLevel) })
                : t('fittings.whatToTrain.notTrained'),
              ...changes,
            ])}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {time === null ? (
            <span className="text-text-dim">{t('common.loading')}</span>
          ) : (
            formatCountdown(time.seconds)
          )}
          {time?.includesPrerequisites && (
            <div>
              <WhatToTrainPrerequisites
                skill={skill}
                rows={prerequisiteRows}
                plannedLevels={plannedLevels}
                planEntries={plan?.entries}
                totalSeconds={time.seconds}
              />
            </div>
          )}
        </div>
      </div>
      {((plan && plannedSpan !== null) || canAdd) && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {plan && plannedSpan !== null && (
            <span className="mr-auto text-[0.6875rem] text-text-dim">
              <Trans
                i18nKey="fittings.whatToTrain.plannedLevels"
                values={{ levels: plannedSpan, plan: plan.name }}
                components={{
                  plan: <Link to={`/skills/plans/${plan.id}`} className={inlineLinkClassName} />,
                }}
              />
            </span>
          )}
          {canAdd && (
            <>
              <Select value={String(level)} onValueChange={(value) => setPicked(Number(value))}>
                <SelectTrigger
                  size="sm"
                  aria-label={t('fittings.whatToTrain.levelLabel', { skill: row.name })}
                  className="w-16"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem
                      key={option.level}
                      value={String(option.level)}
                      disabled={option.planned}
                    >
                      {option.planned
                        ? t('fittings.whatToTrain.levelInPlan', {
                            level: romanLevel(option.level),
                          })
                        : romanLevel(option.level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                aria-label={t('fittings.whatToTrain.addToPlanLabel', { skill })}
                onClick={() => void onAdd(row, level)}
              >
                {t('fittings.whatToTrain.addToPlan')}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
