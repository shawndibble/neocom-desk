import { cx } from '@/lib/cx';
import {
  fieldBaseClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import type { FitCheckRow } from '@/features/skills/ships/fitCheckRows';
import { SkillRow } from '@/features/skills/SkillRow';

export interface WhatToTrainPrerequisitesProps {
  /** "Industrial Reconfiguration IV": the level the card is about. */
  skill: string;
  /** Every skill the level needs trained first, and the skill itself, in training order. */
  rows: readonly FitCheckRow[];
  /** The highest level the target Skill Plan trains each skill to, so a row it already trains says so. */
  plannedLevels: ReadonlyMap<number, number>;
  /** The target Skill Plan's entries, for the Skill Detail popover a skill name opens. */
  planEntries?: readonly PlanEntry[];
  totalSeconds: number;
}

/**
 * "incl. prerequisites", opened: the skills a level can't be had without,
 * each with its time, as the Mastery card lists a hull's. Read-only — Add to
 * plan on the row already puts the prerequisites in ahead of the level.
 */
export function WhatToTrainPrerequisites({
  skill,
  rows,
  plannedLevels,
  planEntries,
  totalSeconds,
}: WhatToTrainPrerequisitesProps) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cx(
            fieldBaseClassName,
            'inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6875rem] text-warning',
            interactiveClassName,
            focusRingClassName
          )}
          aria-label={t('fittings.whatToTrain.prerequisitesOpen', { skill })}
        >
          {t('fittings.whatToTrain.withPrerequisites')}
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text">
            {t('fittings.whatToTrain.prerequisitesTitle', { skill })}
          </p>
          <div className="max-h-72 overflow-y-auto">
            {rows.map((row) => (
              <div key={row.skillTypeID} className="border-b border-line py-1.5 last:border-b-0">
                <SkillRow
                  name={row.name}
                  skillTypeID={row.skillTypeID}
                  planEntries={planEntries}
                  status={row.status}
                  currentLevel={row.currentLevel}
                  timeLabel={formatCountdown(row.seconds)}
                  inPlanLabel={
                    (plannedLevels.get(row.skillTypeID) ?? 0) >= row.targetLevel
                      ? t('skills.fitCheck.inPlan')
                      : undefined
                  }
                  plannedLevel={plannedLevels.get(row.skillTypeID) ?? null}
                />
              </div>
            ))}
          </div>
          <p className="text-right text-xs text-text-dim">
            {t('fittings.whatToTrain.prerequisitesTotal', { time: formatCountdown(totalSeconds) })}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
