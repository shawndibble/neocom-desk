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
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import {
  GAIN_METRICS,
  rankSkillGains,
  trainingTimeFor,
  type GainSort,
  type SkillGain,
  type SkillGainTrainingTime,
} from '@/engine/fittings/skillGains';
import { hasSkillOverrides } from '@/engine/fittings/skillOverrides';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';
import { changeLabel } from './fittingVariationsCsv';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';

const SORTS: readonly GainSort[] = ['overall', ...GAIN_METRICS];
const TOAST_MS = 8000;

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
    <WhatToTrainRanking evaluator={evaluator} characterId={characterId} fittingName={fittingName} />
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
  const ranked = useMemo(() => (rows === null ? null : rankSkillGains(rows, sort)), [rows, sort]);

  if (evaluator === null || loading)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.loading')}</p>;
  if (failed || ranked === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.failed')}</p>;
  if (ranked.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.none')}</p>;

  const planEntries = targetPlanEntries(target);
  const targetPlanName = target.plans?.find((plan) => plan.id === target.targetPlanId)?.name;

  async function add(row: WhatToTrainRow) {
    const result = await target.addEntries(
      [{ skillTypeID: row.skillTypeId, targetLevel: row.toLevel }],
      fittingName
    );
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  const columns: DataTableColumn<WhatToTrainRow>[] = [
    {
      id: 'skill',
      header: t('fittings.whatToTrain.skill'),
      primary: true,
      render: (row) => (
        <span className="font-medium">
          {row.name} {romanLevel(row.toLevel)}
        </span>
      ),
    },
    {
      id: 'changes',
      header: t('fittings.whatToTrain.changes'),
      className: 'text-xs',
      render: (row) => (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {row.delta.changes.map((change) => (
            <span key={change.key}>{changeLabel(change, t)}</span>
          ))}
        </div>
      ),
    },
    {
      id: 'time',
      header: t('fittings.whatToTrain.time'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.time === null ? (
          <span className="text-text-dim">{t('common.loading')}</span>
        ) : (
          <span>
            {formatCountdown(row.time.seconds)}
            {row.time.includesPrerequisites && (
              <span className="block text-[0.6875rem] text-text-dim">
                {t('fittings.whatToTrain.withPrerequisites')}
              </span>
            )}
          </span>
        ),
    },
    {
      id: 'plan',
      header: t('fittings.whatToTrain.plan'),
      align: 'right',
      render: (row) =>
        targetPlanName !== undefined &&
        isEntryCovered(planEntries, row.skillTypeId, row.toLevel) ? (
          <span className="text-xs text-text-dim">
            {t('fittings.whatToTrain.inPlan', { plan: targetPlanName })}
          </span>
        ) : (
          <Button size="sm" onClick={() => void add(row)}>
            {t('fittings.whatToTrain.addToPlan')}
          </Button>
        ),
    },
  ];

  const rankByLabel = t('fittings.whatToTrain.rankBy');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-text-dim">{rankByLabel}</span>
        <Select
          value={sort}
          onValueChange={(value) => {
            const picked = SORTS.find((option) => option === value);
            if (picked) setSort(picked);
          }}
        >
          <SelectTrigger aria-label={rankByLabel} size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
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
      <DataTable
        columns={columns}
        rows={ranked}
        rowKey={(row) => row.skillTypeId}
        label={t('fittings.stats.section.whatToTrain')}
        density="compact"
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
