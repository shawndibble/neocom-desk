import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import * as Icon from '@/components/ui/icons';
import { useCharacterNames } from '@/features/character/useCharacters';
import { eveWhen } from '@/lib/eveTime';
import type { PlanJobKind, PlanScheduleResult, PlanStage } from './planJobSlots';

const KIND_ORDER: readonly PlanJobKind[] = ['reaction', 'part', 'final'];

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
