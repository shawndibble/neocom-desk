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
import { SkillNameButton } from '@/features/skills/SkillNameButton';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { changeLabel } from './fittingVariationsCsv';
import { WhatToTrainPrerequisites } from './FittingWhatToTrainPrerequisites';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';
import { useSkillLevelGain } from './useSkillLevelGain';
import type { SkillPlanRecord } from '@/db';

const TOAST_MS = 8000;
const EYEBROW = 'text-[0.6875rem] uppercase tracking-wider text-text-dim';

interface WhatToTrainRow extends SkillGain {
  name: string;
}

export interface FittingWhatToTrainPanelProps {
  evaluator: SkillGainEvaluator | null;
  /** The active Character; null shows why there's nothing to rank. */
  characterId: number | null;
  /** Names the Skill Plan "Add to plan" creates when the Character has none yet. */
  fittingName: string;
}

export function FittingWhatToTrainPanel({
  evaluator,
  characterId,
  fittingName,
}: FittingWhatToTrainPanelProps) {
  const { t } = useTranslation();
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  if (characterId === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.noCharacter')}</p>;
  if (overridden)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.overridesOn')}</p>;
  return (
    // Keyed so an Undo toast can't outlive a Character switch and sync the wrong pilot.
    <WhatToTrainRanking
      key={characterId}
      evaluator={evaluator}
      characterId={characterId}
      fittingName={fittingName}
    />
  );
}

function WhatToTrainRanking({
  evaluator,
  characterId,
  fittingName,
}: {
  evaluator: SkillGainEvaluator | null;
  characterId: number;
  fittingName: string;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<GainSort>('overall');
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);
  const target = useTargetPlan(characterId);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [added]);
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
  // The schedule for one skill at a level; null before the Character's skills are in,
  // or every row would time from level 0.
  const scheduleFor = useCallback(
    (skillTypeId: number, level: number): readonly ScheduledStep[] | null =>
      catalog && trainedSkillsKnown
        ? scheduleEntries([{ skillTypeID: skillTypeId, targetLevel: level }], {
            skills: catalog.engineSkills,
            trainedSkills,
            attributes,
            implants,
            cloneState,
          })
        : null,
    [catalog, trainedSkills, trainedSkillsKnown, attributes, implants, cloneState]
  );
  // Only the stats some suggestion moves: a mining sort on a warship would rank nothing.
  const sorts = useMemo(
    (): GainSort[] => [
      'overall',
      ...GAIN_METRICS.filter((metric) => rows?.some((row) => row.metrics[metric] !== 0)),
    ],
    [rows]
  );
  const activeSort = sorts.includes(sort) ? sort : 'overall';
  const ranked = useMemo(
    () => (rows === null ? null : rankSkillGains(rows, activeSort)),
    [rows, activeSort]
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
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.loading')}</p>;
  if (failed || ranked === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.failed')}</p>;
  if (ranked.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.none')}</p>;

  async function add(row: WhatToTrainRow, level: number) {
    const result = await target.addEntries(
      [{ skillTypeID: row.skillTypeId, targetLevel: level }],
      fittingName
    );
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  const rankByLabel = t('fittings.whatToTrain.rankBy');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-text-dim">{rankByLabel}</span>
        <Select
          value={activeSort}
          onValueChange={(value) => {
            const picked = sorts.find((option) => option === value);
            if (picked) setSort(picked);
          }}
        >
          <SelectTrigger aria-label={rankByLabel} size="sm" className="w-40">
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
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <TargetPlanPicker target={target} />
          <Link
            to={targetPlan ? `/skills/plans/${targetPlan.id}` : '/skills/plans'}
            className={buttonClassName({ size: 'sm' })}
          >
            {t('fittings.whatToTrain.openPlan')}
          </Link>
        </span>
      </div>
      <ul aria-label={t('fittings.stats.section.whatToTrain')} className="m-0 list-none p-0">
        {ranked.map((row, index) => (
          <WhatToTrainItem
            key={row.skillTypeId}
            row={row}
            rank={index + 1}
            evaluator={evaluator}
            plan={target.plans === undefined ? undefined : (targetPlan ?? null)}
            plannedLevels={plannedLevels}
            scheduleFor={scheduleFor}
            skills={catalog?.engineSkills}
            trainedSkills={trainedSkills}
            onAdd={add}
          />
        ))}
      </ul>
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
 * One suggestion as three bands — the skill, what it changes, what it takes —
 * with a level picker beside Add to plan: the changes and the time follow the
 * level picked.
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

  return (
    <li className="flex flex-col border-t border-line-bright pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
        <span className="text-xs tabular-nums text-text-dim">{rank}</span>
        <SkillNameButton
          skillTypeID={row.skillTypeId}
          planEntries={plan?.entries}
          className="min-w-0 flex-1 font-medium"
        >
          {row.name}
        </SkillNameButton>
        <span className="text-xs text-text-dim">
          {row.fromLevel > 0
            ? t('fittings.whatToTrain.trained', { level: romanLevel(row.fromLevel) })
            : t('fittings.whatToTrain.notTrained')}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-dashed border-line py-2">
        <span className={EYEBROW}>{t('fittings.whatToTrain.changes')}</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {failed ? (
            <span className="text-text-dim">{t('fittings.whatToTrain.levelFailed')}</span>
          ) : gain === null ? (
            <span className="text-text-dim">{t('common.loading')}</span>
          ) : changeCount === 0 ? (
            <span className="text-text-dim">{t('fittings.whatToTrain.noChange')}</span>
          ) : (
            <>
              {gain.delta.changes.map((change) => (
                <span key={change.key}>{changeLabel(change, t)}</span>
              ))}
              {gain.roleChanges.map((change) => (
                <span key={change.key}>
                  {t(`fittings.whatToTrain.role.${change.key}`, {
                    before: change.before.toLocaleString(),
                    after: change.after.toLocaleString(),
                  })}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-line py-2">
        <span className={EYEBROW}>{t('fittings.whatToTrain.time')}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 font-medium tabular-nums">
          {time === null ? (
            <span className="text-text-dim">{t('common.loading')}</span>
          ) : (
            formatCountdown(time.seconds)
          )}
          {time?.includesPrerequisites && (
            <WhatToTrainPrerequisites
              skill={skill}
              rows={prerequisiteRows}
              plannedLevels={plannedLevels}
              totalSeconds={time.seconds}
            />
          )}
        </span>
        {plan && plannedSpan !== null && (
          <span className="text-xs text-text-dim">
            <Trans
              i18nKey="fittings.whatToTrain.plannedLevels"
              values={{ levels: plannedSpan, plan: plan.name }}
              components={{
                plan: <Link to={`/skills/plans/${plan.id}`} className={inlineLinkClassName} />,
              }}
            />
          </span>
        )}
        {plan !== undefined && level !== null && (
          <span className="flex items-center gap-2">
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
                      ? t('fittings.whatToTrain.levelInPlan', { level: romanLevel(option.level) })
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
          </span>
        )}
      </div>
    </li>
  );
}
