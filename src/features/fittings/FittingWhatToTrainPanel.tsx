/**
 * "What to train": which single +1 skill level most improves the open
 * Fitting, each with its whole-Fitting changes and the time to train it at
 * the Character's attributes and implants (the same schedule a Skill Plan
 * uses — prerequisites included, and marked). Only for the active
 * Character's real skills: under All 0 / All V or single-skill overrides a
 * "+1" would build on levels the pilot doesn't have.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
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
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { changeLabel } from './fittingVariationsCsv';
import { useSkillOverrides } from './statsConditions';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillGains } from './useSkillGains';

const SORTS: readonly GainSort[] = ['primary', ...GAIN_METRICS];

interface WhatToTrainRow extends SkillGain {
  name: string;
  /** Null until the Character's skill data has loaded. */
  time: SkillGainTrainingTime | null;
}

export interface FittingWhatToTrainPanelProps {
  evaluator: SkillGainEvaluator | null;
  /** The active Character; null shows why there's nothing to rank. */
  characterId: number | null;
}

export function FittingWhatToTrainPanel({ evaluator, characterId }: FittingWhatToTrainPanelProps) {
  const { t } = useTranslation();
  const overridden = useSkillOverrides((state) => hasSkillOverrides(state.skills));
  if (characterId === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.noCharacter')}</p>;
  if (overridden)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.overridesOn')}</p>;
  return <WhatToTrainRanking evaluator={evaluator} characterId={characterId} />;
}

function WhatToTrainRanking({
  evaluator,
  characterId,
}: {
  evaluator: SkillGainEvaluator | null;
  characterId: number;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<GainSort>('primary');
  const { gains, loading, failed } = useSkillGains(evaluator);
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(characterId);
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
      time: catalog
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
  }, [gains, catalog, trainedSkills, attributes, implants, cloneState]);
  const ranked = useMemo(() => (rows === null ? null : rankSkillGains(rows, sort)), [rows, sort]);

  if (evaluator === null || loading)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.loading')}</p>;
  if (failed || ranked === null)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.failed')}</p>;
  if (ranked.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.whatToTrain.none')}</p>;

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
  ];

  const rankByLabel = t('fittings.whatToTrain.rankBy');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-text-dim">{rankByLabel}</span>
        <Select value={sort} onValueChange={(value) => setSort(value as GainSort)}>
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
      </div>
      <DataTable
        columns={columns}
        rows={ranked}
        rowKey={(row) => row.skillTypeId}
        label={t('fittings.stats.section.whatToTrain')}
        density="compact"
      />
    </div>
  );
}
