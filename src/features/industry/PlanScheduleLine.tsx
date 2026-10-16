import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { scheduleWhen, type PlanJobKind, type PlanScheduleResult } from './planJobSlots';

const KIND_ORDER: readonly PlanJobKind[] = ['reaction', 'part', 'final'];

/**
 * "Uses 6 slots · done by Thu 14:20 · Show plan" for a plan's (or a group's)
 * job tree on its character's slots. Show plan expands in place to the stage
 * order: "Now: 4 reactions · Wed 09:00: 6 parts · Thu 02:00: final item".
 */
export function PlanScheduleLine({
  plan,
  hasSubJobs,
}: {
  plan: PlanScheduleResult;
  /** Sub-jobs are timed at TE 0; the note only matters when there are some. */
  hasSubJobs: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { schedule, stages, nowMs } = plan;
  const stageText = stages
    .map((stage) =>
      t('industry.planSchedule.stage', {
        time:
          stage.startMs <= nowMs
            ? t('industry.planSchedule.now')
            : scheduleWhen(stage.startMs, nowMs),
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
          time: scheduleWhen(schedule.finishMs, nowMs),
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
          <p>{stageText}</p>
          {hasSubJobs && <p className="text-text-faint">{t('industry.planSchedule.teNote')}</p>}
        </>
      )}
    </div>
  );
}
