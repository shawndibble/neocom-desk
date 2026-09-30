/**
 * "What to train": which single +1 skill level most improves the open
 * Fitting, each with its whole-Fitting changes and the time to train it at
 * the Character's attributes and implants (the same schedule a Skill Plan
 * uses — prerequisites included, and marked). Only for the active
 * Character's real skills: under All 0 / All V or single-skill overrides a
 * "+1" would build on levels the pilot doesn't have.
 *
 * Each row's "Add to plan" puts just that level into the picked Skill Plan
 * (a new one named after the Fitting if the Character has none): any missing
 * prerequisites are the plan's own derived prerequisite rows, scheduled
 * ahead of it by the same normalizer the Skill Plan editor runs, so Undo
 * takes back exactly the one entry and its prerequisites go with it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toast,
} from '@/components/ui';
import {
  GAIN_METRICS,
  rankSkillGains,
  trainingTimeFor,
  type GainSort,
  type SkillGain,
  type SkillGainTrainingTime,
} from '@/engine/fittings/skillGains';
import { hasSkillOverrides } from '@/engine/fittings/skillOverrides';
import { normalizePlan } from '@/engine/plan';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan } from '@/features/skills/useTargetPlan';
import { changeLabel } from './fittingVariationsCsv';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';

const TOAST_MS = 8000;
const EYEBROW = 'text-[0.6875rem] uppercase tracking-wider text-text-dim';

interface WhatToTrainRow extends SkillGain {
  name: string;
  /** Null until the Character's skill data has loaded. */
  time: SkillGainTrainingTime | null;
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
      // Not before the Character's skills are in, or every row would time from level 0.
      time:
        catalog && trainedSkillsKnown
          ? trainingTimeFor(
              scheduleEntries([{ skillTypeID: gain.skillTypeId, targetLevel: gain.toLevel }], {
                skills: catalog.engineSkills,
                trainedSkills,
                attributes,
                implants,
                cloneState,
              }),
              gain.skillTypeId
            )
          : null,
    }));
  }, [gains, catalog, trainedSkills, trainedSkillsKnown, attributes, implants, cloneState]);
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
    if (!catalog) return levels;
    try {
      const known = targetPlan.entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
      for (const step of normalizePlan(known, catalog.engineSkills, trainedSkills)) {
        raise(step.skillTypeID, step.level);
      }
    } catch {
      // A circular plan is the Skill Plan editor's to report; its entries still count.
    }
    return levels;
  }, [targetPlan, catalog, trainedSkills]);

  if (evaluator === null || loading)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.loading')}</p>;
  if (failed || ranked === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.failed')}</p>;
  if (ranked.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.none')}</p>;

  async function add(row: WhatToTrainRow) {
    const result = await target.addEntries(
      [{ skillTypeID: row.skillTypeId, targetLevel: row.toLevel }],
      fittingName
    );
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  function planAction(row: WhatToTrainRow) {
    // Nothing until the plans load, or an already-planned level would flash an Add.
    if (target.plans === undefined) return null;
    if (targetPlan && (plannedLevels.get(row.skillTypeId) ?? 0) >= row.toLevel) {
      return (
        <span className="text-xs text-text-dim">
          {t('fittings.whatToTrain.inPlan', { plan: targetPlan.name })}
        </span>
      );
    }
    const skill = `${row.name} ${romanLevel(row.toLevel)}`;
    return (
      <Button
        size="sm"
        aria-label={t('fittings.whatToTrain.addToPlanLabel', { skill })}
        onClick={() => void add(row)}
      >
        {t('fittings.whatToTrain.addToPlan')}
      </Button>
    );
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
        <span className="ml-auto">
          <TargetPlanPicker target={target} />
        </span>
      </div>
      <ul aria-label={t('fittings.stats.section.whatToTrain')} className="m-0 list-none p-0">
        {ranked.map((row, index) => (
          <li
            key={row.skillTypeId}
            className="flex flex-col border-t border-line-bright pt-2.5 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
              <span className="text-xs tabular-nums text-text-dim">{index + 1}</span>
              <span className="min-w-0 flex-1 font-medium">
                {row.name} {romanLevel(row.toLevel)}
              </span>
              {row.time?.includesPrerequisites && (
                <span className="text-[0.6875rem] text-warning">
                  {t('fittings.whatToTrain.withPrerequisites')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-dashed border-line py-2">
              <span className={EYEBROW}>{t('fittings.whatToTrain.changes')}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {row.delta.changes.map((change) => (
                  <span key={change.key}>{changeLabel(change, t)}</span>
                ))}
                {row.roleChanges.map((change) => (
                  <span key={change.key}>
                    {t(`fittings.whatToTrain.role.${change.key}`, {
                      before: change.before.toLocaleString(),
                      after: change.after.toLocaleString(),
                    })}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-line py-2">
              <span className={EYEBROW}>{t('fittings.whatToTrain.time')}</span>
              <span className="min-w-0 flex-1 font-medium tabular-nums">
                {row.time === null ? (
                  <span className="text-text-dim">{t('common.loading')}</span>
                ) : (
                  formatCountdown(row.time.seconds)
                )}
              </span>
              {planAction(row)}
            </div>
          </li>
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
