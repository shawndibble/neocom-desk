import { useTranslation } from 'react-i18next';
import { Panel, StatChip } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { MIN_MEANINGFUL_SAVINGS_SECONDS, type OptimizationBadge } from './planHeaderStats';

interface PlanHeaderProps {
  totalSeconds: number;
  skillCount: number;
  projectedFinish: Date | null;
  /** null when the plan has no valid entries to optimize. */
  badge: OptimizationBadge | null;
  /**
   * The What-If Booster these totals were computed under, or null when they
   * were not. A Booster is a hypothesis the user types into the tools pane,
   * not something the game reports, and a large one knocks a third off every
   * number in this strip — so the strip has to say so. `EntryList` already
   * marks the individual rows a Booster speeds up; this says the same thing
   * about the one figure a user actually compares against the in-game queue.
   */
  booster?: { bonus: number; expiresAt: Date } | null;
}

/**
 * Plan-at-a-glance header: total time, skill count, projected finish, a live
 * remap-savings badge, and — when one is assumed — the Booster the totals
 * were computed under.
 */
export function PlanHeader({
  totalSeconds,
  skillCount,
  projectedFinish,
  badge,
  booster = null,
}: PlanHeaderProps) {
  const { t } = useTranslation();
  const savingsSeconds = badge?.savingsSeconds ?? 0;
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
      {/* `lg:flex-nowrap` keeps this row one line at `lg`+, where the sidebar
          leaves it less width than the page; `lg:overflow-x-auto` keeps any
          overflow reachable at the narrow end of that range. */}
      <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:overflow-x-auto">
        <StatChip label={t('plans.headerTrainingTime')} value={formatDuration(totalSeconds)} />
        {booster && (
          // Immediately after the total, because it is a caveat on that
          // number rather than a statistic of its own.
          <StatChip
            label={t('plans.headerBoosterLabel')}
            tone="warning"
            tooltip={t('plans.headerBoosterTooltip')}
            value={t('plans.headerBoosterValue', {
              bonus: booster.bonus,
              date: booster.expiresAt.toLocaleDateString(),
            })}
          />
        )}
        <StatChip label={t('plans.headerSkillCount')} value={skillCount} />
        <StatChip
          label={t('plans.headerProjectedFinish')}
          value={projectedFinish ? projectedFinish.toLocaleDateString() : t('plans.headerNoFinish')}
        />
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
