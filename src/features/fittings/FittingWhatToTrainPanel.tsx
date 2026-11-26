import { useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  buttonClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  IconButton,
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
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
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
import { useModuleUpgrades } from './useModuleUpgrades';
import { SkillFixList } from './FittingSkillFixList';
import { useSkillFixes } from './useSkillFixes';
import { usePlannedLevels, useTrainingSchedule } from './useTrainingSchedule';
import { cx } from '@/lib/cx';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import { rankModuleUpgrades } from '@/engine/fittings/moduleUpgrades';
import type { SkillPlanRecord } from '@/db';
import { StatNote } from './StatFacts';
import { Expanded } from '@/components/ui/icons';
import { STAT_DETAIL, STAT_EYEBROW_TYPE, joinDetail } from './statKit';
import { TrainRow } from './FittingTrainRow';

export interface WhatToTrainRow extends SkillGain {
  name: string;
}

export interface FittingWhatToTrainPanelProps {
  evaluator: SkillGainEvaluator | null;
  characterId: number | null;
  fittingName: string;
  catalogue: FittingCatalogue | null;
  missingSkills?: readonly PlanEntry[];
}

const NO_ENTRIES: readonly PlanEntry[] = [];

export function FittingWhatToTrainPanel({
  evaluator,
  characterId,
  fittingName,
  catalogue,
  missingSkills,
}: FittingWhatToTrainPanelProps) {
  const { t } = useTranslation();
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  if (characterId === null) return <StatNote>{t('fittings.whatToTrain.noCharacter')}</StatNote>;
  if (overridden) return <StatNote>{t('fittings.whatToTrain.overridesOn')}</StatNote>;
  return (
    <WhatToTrainRanking
      key={characterId}
      evaluator={evaluator}
      characterId={characterId}
      fittingName={fittingName}
      catalogue={catalogue}
      missingSkills={missingSkills}
    />
  );
}

function WhatToTrainRanking({
  evaluator,
  characterId,
  fittingName,
  catalogue,
  missingSkills = NO_ENTRIES,
}: {
  evaluator: SkillGainEvaluator | null;
  characterId: number;
  fittingName: string;
  catalogue: FittingCatalogue | null;
  missingSkills?: readonly PlanEntry[];
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<GainSort>('overall');
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);
  const target = useTargetPlan(characterId);
  const { gains, loading, failed } = useSkillGains(evaluator);
  const { catalog, trainedSkills, trainedSkillsKnown, scheduleEntriesFor } =
    useTrainingSchedule(characterId);
  const overBudget = gains?.some((gain) => (gain.budgetFreed ?? 0) > 0) ?? false;
  const skillFixes = useSkillFixes(evaluator, overBudget);
  const missingFixes = useMemo(
    () => missingSkills.map((entry) => ({ entries: [entry] })),
    [missingSkills]
  );

  const rows = useMemo((): WhatToTrainRow[] | null => {
    if (gains === null) return null;
    return gains.map((gain) => ({
      ...gain,
      name: catalog?.engineSkills.get(gain.skillTypeId)?.name ?? `#${gain.skillTypeId}`,
    }));
  }, [gains, catalog]);
  const scheduleFor = useCallback(
    (skillTypeId: number, level: number): readonly ScheduledStep[] | null =>
      scheduleEntriesFor?.([{ skillTypeID: skillTypeId, targetLevel: level }]) ?? null,
    [scheduleEntriesFor]
  );
  const upgrades = useModuleUpgrades(evaluator, catalogue, scheduleEntriesFor);
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
  const improves = useMemo(() => {
    if (ranked === null) return null;
    const fixSkills = new Set(
      [...missingFixes, ...(skillFixes.fixes ?? [])].flatMap((fix) =>
        fix.entries.map((entry) => entry.skillTypeID)
      )
    );
    return ranked.filter((row) => !fixSkills.has(row.skillTypeId));
  }, [ranked, missingFixes, skillFixes.fixes]);
  const rankedUpgrades = useMemo(
    () => (upgrades.rows === null ? null : rankModuleUpgrades(upgrades.rows, activeSort)),
    [upgrades.rows, activeSort]
  );

  const targetPlan = target.plans?.find((plan) => plan.id === target.targetPlanId);
  const plannedLevels = usePlannedLevels(targetPlan, catalog, trainedSkills, trainedSkillsKnown);

  async function addEntries(entries: readonly PlanEntry[]) {
    const result = await target.addEntries(entries, fittingName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }
  const add = (row: WhatToTrainRow, level: number) =>
    addEntries([{ skillTypeID: row.skillTypeId, targetLevel: level }]);
  const plan = target.plans === undefined ? undefined : (targetPlan ?? null);
  const fixListProps = {
    skills: catalog?.engineSkills,
    trainedSkills,
    scheduleEntriesFor,
    plan,
    plannedLevels,
    onAdd: (entries: readonly PlanEntry[]) => void addEntries(entries),
  };
  const hasFixes = missingFixes.length > 0 || (skillFixes.fixes?.length ?? 0) > 0;
  const fixBlock = hasFixes && (
    <div className="space-y-1">
      <p className={cx(STAT_EYEBROW_TYPE, 'text-warning')}>{t('fittings.skillFixes.heading')}</p>
      {missingFixes.length > 0 && (
        <>
          <p className={STAT_DETAIL}>{t('fittings.skillFixes.missing')}</p>
          <SkillFixList fixes={missingFixes} {...fixListProps} together />
        </>
      )}
      {skillFixes.fixes && skillFixes.fixes.length > 0 && (
        <>
          <p
            className={cx(STAT_DETAIL, missingFixes.length > 0 && 'mt-2 border-t border-line pt-2')}
          >
            {t('fittings.skillFixes.makesItFit')}
          </p>
          <SkillFixList fixes={skillFixes.fixes} {...fixListProps} />
        </>
      )}
    </div>
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

  const stillLoading = evaluator === null || loading;
  if (stillLoading || failed || improves === null)
    return (
      <div className="space-y-3">
        {fixBlock}
        <StatNote>
          {t(stillLoading ? 'fittings.whatToTrain.loading' : 'fittings.whatToTrain.failed')}
        </StatNote>
        {toast}
      </div>
    );

  const rankByLabel = t('fittings.whatToTrain.rankBy');
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Select
          value={activeSort}
          onValueChange={(value) => {
            const picked = sorts.find((option) => option === value);
            if (picked) setSort(picked);
          }}
        >
          <SelectTrigger aria-label={rankByLabel} size="sm" className="w-full">
            <span className="min-w-0 truncate">
              <span className="text-text-dim">{rankByLabel}: </span>
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {sorts.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`fittings.whatToTrain.sort.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          {target.plans && target.plans.length > 1 ? (
            <TargetPlanPicker
              target={target}
              bare
              prefix={t('skills.targetPlan.label')}
              className="min-w-0 flex-1"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">
              <span className="text-text-dim">{t('skills.targetPlan.label')}: </span>
              {targetPlan?.name ?? t('fittings.whatToTrain.newPlan', { name: fittingName })}
            </span>
          )}
          <Link
            to={targetPlan ? `/skills/plans/${targetPlan.id}` : '/skills/plans'}
            className={cx(buttonClassName({ size: 'sm' }), 'shrink-0')}
          >
            {t('fittings.whatToTrain.openPlan')}
          </Link>
        </div>
      </div>
      {fixBlock}
      {improves.length === 0 && rankedUpgrades?.length === 0 && !hasFixes && (
        <StatNote>{t('fittings.whatToTrain.none')}</StatNote>
      )}
      {improves.length > 0 && (
        <div className={cx('space-y-1', hasFixes && 'mt-3')}>
          {hasFixes && <p className={STAT_EYEBROW_TYPE}>{t('fittings.whatToTrain.improvesFit')}</p>}
          <ul
            aria-label={t('fittings.stats.section.whatToTrain')}
            className="m-0 list-none p-0 text-xs"
          >
            {improves.map((row, index) => (
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
        </div>
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
      {toast}
    </div>
  );
}

export interface WhatToTrainItemProps {
  row: WhatToTrainRow;
  rank: number;
  evaluator: SkillGainEvaluator;
  plan: SkillPlanRecord | null | undefined;
  plannedLevels: ReadonlyMap<number, number>;
  scheduleFor: (skillTypeId: number, level: number) => readonly ScheduledStep[] | null;
  skills: ReadonlyMap<number, EngineSkill> | undefined;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  onAdd: (row: WhatToTrainRow, level: number) => Promise<void>;
}

function levelSpan(from: number, to: number): string {
  return from === to ? romanLevel(from) : `${romanLevel(from)}–${romanLevel(to)}`;
}

export function WhatToTrainItem({
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
    <TrainRow
      title={
        <span className="flex items-baseline gap-2">
          <span className="text-text-dim tabular-nums">{rank}</span>
          <SkillLink
            typeId={row.skillTypeId}
            planEntries={plan?.entries}
            className="min-w-0 font-semibold"
          >
            {row.name}
          </SkillLink>
          <span className={cx(STAT_DETAIL, 'shrink-0')}>
            {row.fromLevel > 0
              ? t('fittings.whatToTrain.trained', { level: romanLevel(row.fromLevel) })
              : t('fittings.whatToTrain.notTrained')}
          </span>
        </span>
      }
      detail={joinDetail(changes)}
      status={
        plan &&
        plannedSpan !== null && (
          <Trans
            i18nKey="fittings.whatToTrain.plannedLevels"
            values={{ levels: plannedSpan, plan: plan.name }}
            components={{
              plan: <Link to={`/skills/plans/${plan.id}`} className={inlineLinkClassName} />,
            }}
          />
        )
      }
      time={
        time === null ? (
          <span className="text-text-dim">{t('common.loading')}</span>
        ) : (
          formatCountdown(time.seconds)
        )
      }
      prerequisites={
        time?.includesPrerequisites && (
          <WhatToTrainPrerequisites
            skill={skill}
            rows={prerequisiteRows}
            plannedLevels={plannedLevels}
            planEntries={plan?.entries}
            totalSeconds={time.seconds}
          />
        )
      }
      action={
        canAdd && (
          <div className="flex">
            <Button
              size="sm"
              className={options.length > 1 ? 'rounded-r-none' : undefined}
              aria-label={t('fittings.whatToTrain.addToPlanLabel', { skill })}
              onClick={() => void onAdd(row, level)}
            >
              {t('fittings.whatToTrain.addLevel', { level: romanLevel(level) })}
            </Button>
            {options.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    size="sm"
                    icon={<Expanded />}
                    label={t('fittings.whatToTrain.levelLabel', { skill: row.name })}
                    className="-ml-px rounded-l-none"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={String(level)}
                    onValueChange={(value) => setPicked(Number(value))}
                  >
                    {options.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.level}
                        value={String(option.level)}
                        disabled={option.planned}
                      >
                        {option.planned
                          ? t('fittings.whatToTrain.levelInPlan', {
                              level: romanLevel(option.level),
                            })
                          : romanLevel(option.level)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      }
    />
  );
}
