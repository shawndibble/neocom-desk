import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import * as Icon from '@/components/ui/icons';
import { useCharacterNames } from '@/features/character/useCharacters';
import { eveWhen } from '@/lib/eveTime';
import type { PlanJobKind, PlanScheduleResult, PlanStage } from './planJobSlots';

const KIND_ORDER: readonly PlanJobKind[] = ['reaction', 'part', 'final'];

/**
 * "Uses 6 slots · done by Thu 14:20 · [Show plan ▾]" for a plan's (or a
 * group's) job tree on its character's slots. Show plan opens a popover with
 * the stage order: "Now: 4 reactions · Wed 09:00: 6 parts · Thu 02:00: final item". When
 * the jobs are shared across Characters, Show plan also lists a lane per
 * Character: "Alice: Now: 2 parts · Thu 02:00: final item".
 */
export function PlanScheduleLine({ plan }: { plan: PlanScheduleResult }) {
  const { t } = useTranslation();
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-text-dim">
      <span>
        {t('industry.planSchedule.line', {
          count: schedule.peakSlots,
          time: eveWhen(schedule.finishMs, nowMs),
        })}
      </span>
      {/* §6c: a bordered button ending in a caret opens a read-only popover
          (as the Ship Tree's Legend does), so the stage order does not push
          the hero's verdict down when it is opened. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm">
            {t('industry.planSchedule.show')}
            <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={t('industry.planSchedule.show')}
          className="w-80 space-y-1.5 p-3 text-xs tabular-nums"
        >
          <p>{stageText(stages)}</p>
          {lanes.map((lane) => (
            <p key={lane.characterId} className="text-text-dim">
              {t('industry.planSchedule.lane', {
                name: names.get(lane.characterId) ?? lane.characterId,
                stages: stageText(lane.stages),
              })}
            </p>
          ))}
          {hasSubJobs && <p className="text-text-dim">{t('industry.planSchedule.teNote')}</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
