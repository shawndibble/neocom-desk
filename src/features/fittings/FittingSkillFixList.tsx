import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { SkillFix } from '@/engine/fittings/skillFixes';
import { scheduledSkillTargets } from '@/engine/fittings/skillGains';
import { splitSharedSchedule } from '@/engine/fittings/sharedSchedule';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { SkillLink } from '@/features/entities';
import { formatCountdown } from '@/lib/duration';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { WhatToTrainPrerequisites } from './FittingWhatToTrainPrerequisites';
import { TrainRow } from './FittingTrainRow';
import type { ScheduleEntries } from './useModuleUpgrades';

interface Props {
  fixes: readonly Pick<SkillFix, 'entries'>[];
  skills: ReadonlyMap<number, EngineSkill> | undefined;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  scheduleEntriesFor: ScheduleEntries | null;
  plan: SkillPlanRecord | null | undefined;
  plannedLevels: ReadonlyMap<number, number>;
  onAdd: (entries: readonly PlanEntry[]) => void;
  together?: boolean;
}

function fixSchedules(
  fixes: readonly Pick<SkillFix, 'entries'>[],
  scheduleEntriesFor: ScheduleEntries | null,
  together: boolean
): (readonly ScheduledStep[] | null)[] {
  const solo = fixes.map((fix) => scheduleEntriesFor?.(fix.entries) ?? null);
  if (!together || fixes.length < 2) return solo;
  const combined = scheduleEntriesFor?.(fixes.flatMap((fix) => fix.entries)) ?? null;
  if (combined === null || solo.some((steps) => steps === null)) return fixes.map(() => null);
  return splitSharedSchedule(
    fixes.map((fix) => fix.entries),
    combined,
    solo.map((steps) => steps ?? [])
  );
}

export function SkillFixList({
  fixes,
  skills,
  trainedSkills,
  scheduleEntriesFor,
  plan,
  plannedLevels,
  onAdd,
  together = false,
}: Props) {
  const { t } = useTranslation();
  const skillName = (id: number) => skills?.get(id)?.name ?? `#${id}`;
  const schedules = fixSchedules(fixes, scheduleEntriesFor, together);
  const rows = fixes
    .map((fix, index) => {
      const scheduled = schedules[index];
      const seconds = scheduled?.reduce((sum, step) => sum + step.seconds, 0) ?? null;
      const includesPrerequisites =
        scheduled?.some((step) => !fix.entries.some((e) => e.skillTypeID === step.skillTypeID)) ??
        false;
      const prerequisiteRows =
        includesPrerequisites && scheduled && skills
          ? buildFitCheckRows(scheduledSkillTargets(scheduled), skills, trainedSkills, scheduled)
          : [];
      return { fix, seconds, prerequisiteRows };
    })
    .sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity));

  return (
    <ul className="m-0 list-none p-0 text-xs">
      {rows.map(({ fix, seconds, prerequisiteRows }) => {
        const label = fix.entries
          .map((e) => `${skillName(e.skillTypeID)} ${romanLevel(e.targetLevel)}`)
          .join(', ');
        const planned = fix.entries.every(
          (e) => (plannedLevels.get(e.skillTypeID) ?? 0) >= e.targetLevel
        );
        return (
          <TrainRow
            key={label}
            title={
              <p className="font-semibold">
                {fix.entries.map((e) => (
                  <span key={e.skillTypeID} className="block">
                    <SkillLink typeId={e.skillTypeID} planEntries={plan?.entries}>
                      {skillName(e.skillTypeID)}
                    </SkillLink>{' '}
                    {romanLevel(e.targetLevel)}
                  </span>
                ))}
              </p>
            }
            time={
              seconds === null ? (
                <span className="text-text-dim">{t('common.loading')}</span>
              ) : (
                formatCountdown(seconds)
              )
            }
            prerequisites={
              seconds !== null &&
              prerequisiteRows.length > 0 && (
                <WhatToTrainPrerequisites
                  skill={label}
                  rows={prerequisiteRows}
                  plannedLevels={plannedLevels}
                  planEntries={plan?.entries}
                  totalSeconds={seconds}
                />
              )
            }
            action={
              plan !== undefined &&
              (plan && planned ? (
                <span className="max-w-32 truncate text-[0.6875rem] text-text-dim">
                  {t('fittings.skillFixes.inPlan', { plan: plan.name })}
                </span>
              ) : (
                <Button
                  size="sm"
                  aria-label={t('fittings.whatToTrain.addToPlanLabel', { skill: label })}
                  onClick={() => onAdd(fix.entries)}
                >
                  {t(
                    fix.entries.length > 1
                      ? 'fittings.whatToTrain.addAll'
                      : 'fittings.whatToTrain.addToPlan'
                  )}
                </Button>
              ))
            }
          />
        );
      })}
    </ul>
  );
}
