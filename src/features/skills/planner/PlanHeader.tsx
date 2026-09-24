import { useTranslation } from 'react-i18next';
import { Panel, StatChip } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { formatCompactNumber } from '@/lib/compactNumber';
import { romanLevel } from '@/engine/projection';
import type { PlanProgress } from '@/engine/planProgress';
import { doneByText } from './doneBy';
import { MIN_MEANINGFUL_SAVINGS_SECONDS, type OptimizationBadge } from './planHeaderStats';

interface PlanHeaderProps {
  totalSeconds: number;
  skillCount: number;
  projectedFinish: Date | null;
  /** null when the plan has no valid entries to optimize. */
  badge: OptimizationBadge | null;
  /**
   * The soonest not-yet-reached Plan Milestone (CONTEXT.md), or null when the
   * plan has none still ahead — a reached or orphaned one never shows here
   * (`engine/skillPlanMilestones.ts`'s `nextMilestone`).
   */
  nextMilestone: { name: string; finish: Date } | null;
  /** Share of the plan already trained; omitted by callers with no plan basis. */
  progress?: PlanProgress;
  /** The first step of the Skill Plan schedule, with what its "Done by" date needs. */
  nextStep?: { name: string; level: number; cumulativeSeconds: number; startDate: Date } | null;
  /** False until the character's trained skills have loaded: progress reads `—`, not 0%. */
  trainedKnown?: boolean;
}

/**
 * Plan-at-a-glance header: total time, skill count, projected finish, a live
 * remap-savings badge, and the next Plan Milestone still ahead.
 */
export function PlanHeader({
  totalSeconds,
  skillCount,
  projectedFinish,
  badge,
  nextMilestone,
  progress,
  nextStep = null,
  trainedKnown = true,
}: PlanHeaderProps) {
  const { t } = useTranslation();
  const savingsSeconds = badge?.savingsSeconds ?? 0;
  const progressFraction = progress?.fraction ?? null;
  const showsSavings = badge !== null && savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;

  return (
    // Still pinned, but now the *only* pinned thing on the page, so its
    // offset is a plain `top-0` rather than a number measured off a
    // neighbour. The entry list has its own cap, yet the window can still
    // scroll when the sidebar beside it outgrows the viewport (a long plan
    // list plus an expanded optimize result) — and this strip is the plan's
    // headline numbers, which should survive that. What retires #221/#229 is
    // that there is no second sticky panel below needing this one's rendered
    // height; nothing here has to stay in sync with anything.
    <Panel title={t('plans.headerTitle')} className="lg:sticky lg:top-0 lg:z-10">
      {/* A plain wrapping strip, like every other row of StatChips in the app. */}
      <div className="flex flex-wrap gap-2">
        <StatChip label={t('plans.headerTrainingTime')} value={formatDuration(totalSeconds)} />
        <StatChip label={t('plans.headerSkillCount')} value={skillCount} />
        <StatChip
          label={t('plans.headerProjectedFinish')}
          value={projectedFinish ? formatLocalDate(projectedFinish) : t('plans.headerNoFinish')}
        />
        {progress && progressFraction !== null && (
          <StatChip
            label={t('plans.headerTrained')}
            value={
              trainedKnown ? (
                <>
                  {Math.floor(progressFraction * 100)}%{' '}
                  <span className="text-text-dim">
                    {t('plans.headerTrainedSp', {
                      trained: formatCompactNumber(progress.trainedSp),
                      total: formatCompactNumber(progress.totalSp),
                    })}
                  </span>
                </>
              ) : (
                '—'
              )
            }
          />
        )}
        {progressFraction !== null && (
          <StatChip
            label={t('plans.headerNextStep')}
            value={
              !trainedKnown ? (
                '—'
              ) : nextStep ? (
                <>
                  {t('plans.headerNextStepValue', {
                    name: nextStep.name,
                    level: romanLevel(nextStep.level),
                  })}{' '}
                  <span className="text-text-dim">
                    {doneByText(nextStep.cumulativeSeconds, nextStep.startDate)}
                  </span>
                </>
              ) : (
                t('plans.headerNothingLeft')
              )
            }
          />
        )}
        {nextMilestone && (
          <StatChip
            label={t('plans.milestone.next')}
            value={
              <>
                {nextMilestone.name}{' '}
                <span className="text-text-dim">{formatLocalDate(nextMilestone.finish)}</span>
              </>
            }
          />
        )}
        {badge && (
          <StatChip
            label={t('plans.headerSavingsLabel')}
            tone={showsSavings ? 'success' : 'default'}
            value={
              <>
                {showsSavings ? formatDuration(savingsSeconds) : t('plans.headerSavingsNone')}
                {badge.capped && (
                  <span className="ml-1 text-text-dim">
                    {t('plans.remapCapNote', { count: badge.evaluatedRemapCount })}
                  </span>
                )}
              </>
            }
          />
        )}
      </div>
    </Panel>
  );
}
