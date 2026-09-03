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
}

/**
 * Plan-at-a-glance header: total time, skill count, projected finish, and a
 * live remap-savings badge.
 */
export function PlanHeader({ totalSeconds, skillCount, projectedFinish, badge }: PlanHeaderProps) {
  const { t } = useTranslation();
  const savingsSeconds = badge?.savingsSeconds ?? 0;
  const showsSavings = badge !== null && savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;

  return (
    // Not sticky any more, and no longer measured: only the entry list
    // scrolls now (PlanEditor caps that list alone), so this strip stays in
    // view by simply sitting above it. That retires the pair of stacked
    // sticky panels whose offsets had to be derived from each other's
    // rendered height and drifted apart whenever either changed (#221/#229).
    <Panel title={t('plans.headerTitle')}>
      {/* `lg:flex-nowrap` keeps this row one line at `lg`+, where the sidebar
          leaves it less width than the page; `lg:overflow-x-auto` keeps any
          overflow reachable at the narrow end of that range. */}
      <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:overflow-x-auto">
        <StatChip label={t('plans.headerTrainingTime')} value={formatDuration(totalSeconds)} />
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
