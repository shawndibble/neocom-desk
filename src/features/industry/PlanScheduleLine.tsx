import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { useCharacterNames } from '@/features/character/useCharacters';
import { eveWhen } from '@/lib/eveTime';
import type { PlanJobKind, PlanScheduleResult, PlanStage } from './planJobSlots';

const KIND_ORDER: readonly PlanJobKind[] = ['reaction', 'part', 'final'];

/**
 * "Uses 6 slots · done by Thu 14:20 · Show plan" for a plan's (or a group's)
 * job tree on its character's slots. Show plan expands in place to the stage
 * order: "Now: 4 reactions · Wed 09:00: 6 parts · Thu 02:00: final item". When
 * the jobs are shared across Characters, Show plan also lists a lane per
 * Character: "Alice: Now: 2 parts · Thu 02:00: final item".
 */
export function PlanScheduleLine({ plan }: { plan: PlanScheduleResult }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const names = useCharacterNames();
  const { schedule, stages, lanes, nowMs, hasSubJobs } = plan;
  const stageText = (laneStages: readonly PlanStage[]) =>
    laneStages
      .map((stage) =>
        t('industry.planSchedule.stage', {
          time:
            stage.startMs <= nowMs ? t('industry.planSchedule.now') : eveWhen(stage.startMs, nowMs),
          jobs: KIND_ORDER.filter((kind) => stage.counts[kind] > 0)
            .map((kind) => t(`industry.planSchedule.${kind}`, { count: stage.counts[kind] }))
            .join(' + '),
        })
      )
      .join(' · ');
  return (
    <div className="text-xs tabular-nums text-text-dim">
      <p>
        {t('industry.planSchedule.line', {
          count: schedule.peakSlots,
          time: eveWhen(schedule.finishMs, nowMs),
        })}{' '}
        ·{' '}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xs text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Caret expanded={open} />
          {open ? t('industry.planSchedule.hide') : t('industry.planSchedule.show')}
        </button>
      </p>
      {open && (
        <>
          <p>{stageText(stages)}</p>
          {lanes.map((lane) => (
            <p key={lane.characterId}>
              {t('industry.planSchedule.lane', {
                name: names.get(lane.characterId) ?? lane.characterId,
                stages: stageText(lane.stages),
              })}
            </p>
          ))}
          {hasSubJobs && <p className="text-text-faint">{t('industry.planSchedule.teNote')}</p>}
        </>
      )}
    </div>
  );
}
