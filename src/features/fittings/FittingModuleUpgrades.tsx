import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { scheduleTimeFor } from '@/engine/fittings/moduleUpgrades';
import { scheduledSkillTargets } from '@/engine/fittings/skillGains';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import type { SkillPlanRecord } from '@/db';
import { gainChangeLabels } from './whatToTrainChanges';
import { WhatToTrainPrerequisites } from './FittingWhatToTrainPrerequisites';
import type { ModuleUpgradeRow } from './useModuleUpgrades';
import { STAT_DETAIL, joinDetail, statRowClassName } from './statKit';

export interface ModuleUpgradeListProps {
  rows: readonly ModuleUpgradeRow[] | null;
  typeName: (typeId: number) => string;
  skills: ReadonlyMap<number, EngineSkill> | undefined;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  plan: SkillPlanRecord | null | undefined;
  plannedLevels: ReadonlyMap<number, number>;
  onAdd: (entries: readonly PlanEntry[]) => Promise<void>;
}

export function ModuleUpgradeList({ rows, ...item }: ModuleUpgradeListProps) {
  const { t } = useTranslation();
  const headingId = useId();
  if (rows !== null && rows.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-1">
      <h4 id={headingId} className="m-0 text-xs font-semibold text-text-dim">
        {t('fittings.whatToTrain.upgrades.title')}
      </h4>
      {rows === null ? (
        <p className={STAT_DETAIL}>{t('fittings.whatToTrain.upgrades.loading')}</p>
      ) : (
        <ul className="m-0 list-none p-0 text-xs">
          {rows.map((row) => (
            <ModuleUpgradeItem key={row.fromTypeId} row={row} {...item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ModuleUpgradeItem({
  row,
  typeName,
  skills,
  trainedSkills,
  plan,
  plannedLevels,
  onAdd,
}: Omit<ModuleUpgradeListProps, 'rows'> & { row: ModuleUpgradeRow }) {
  const { t } = useTranslation();
  const toName = typeName(row.toTypeId);
  const swap = t('fittings.whatToTrain.upgrades.swap', {
    count: row.at.length,
    from: typeName(row.fromTypeId),
    to: toName,
  });
  const time = scheduleTimeFor(
    row.scheduled,
    row.required.map((entry) => entry.skillTypeID)
  );
  const needs = t('fittings.whatToTrain.upgrades.withTrained', {
    skills: row.required
      .map(
        (entry) =>
          `${skills?.get(entry.skillTypeID)?.name ?? `#${entry.skillTypeID}`} ${romanLevel(entry.targetLevel)}`
      )
      .join(', '),
  });
  const changes = gainChangeLabels(row, t);
  const prerequisiteRows = skills
    ? buildFitCheckRows(scheduledSkillTargets(row.scheduled), skills, trainedSkills, row.scheduled)
    : [];

  return (
    <li className={statRowClassName()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{swap}</span>
          <p className={STAT_DETAIL}>{joinDetail([needs, ...changes])}</p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {formatCountdown(time.seconds)}
          {time.includesPrerequisites && (
            <div>
              <WhatToTrainPrerequisites
                skill={toName}
                rows={prerequisiteRows}
                plannedLevels={plannedLevels}
                planEntries={plan?.entries}
                totalSeconds={time.seconds}
              />
            </div>
          )}
        </div>
      </div>
      {plan !== undefined && (
        <div className="mt-1 flex justify-end">
          <Button
            size="sm"
            aria-label={t('fittings.whatToTrain.upgrades.addToPlanLabel', { module: toName })}
            onClick={() => void onAdd(row.required)}
          >
            {t('fittings.whatToTrain.addToPlan')}
          </Button>
        </div>
      )}
    </li>
  );
}
