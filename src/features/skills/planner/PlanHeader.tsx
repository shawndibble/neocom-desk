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

/** Plan-at-a-glance header: total time, skill count, projected finish, and a live remap-savings badge. */
export function PlanHeader({ totalSeconds, skillCount, projectedFinish, badge }: PlanHeaderProps) {
  const { t } = useTranslation();
  const savingsSeconds = badge?.savingsSeconds ?? 0;
  const showsSavings = badge !== null && savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;

  return (
    // Sticky from `lg` up, same as the toolbar below it (PlanEditor.tsx):
    // both stay visible while a long entry queue scrolls inside
    // SkillPlanEditor's own scroll box. This is the first (topmost) sticky
    // Panel, so it sticks flush at `top-0`; the toolbar below it uses a
    // non-zero offset so the two stack instead of overlapping. `lg:z-20`
    // keeps it above the toolbar's `lg:z-10` while both are stuck.
    <Panel title={t('plans.headerTitle')} className="lg:sticky lg:top-0 lg:z-20">
      {/* `lg:flex-nowrap` keeps this row a fixed one-line height at `lg`+ so
          the toolbar's hardcoded stacking offset below stays correct
          instead of drifting if a chip (e.g. the remap-savings note) wraps
          to a second row; `lg:overflow-x-auto` keeps any overflow reachable
          at the narrow end of `lg`. */}
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
