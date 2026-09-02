import { forwardRef } from 'react';
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
 *
 * Forwards its ref to the root Panel — PlanEditor.tsx measures this Panel's
 * rendered height at runtime to position the also-sticky toolbar below it.
 */
export const PlanHeader = forwardRef<HTMLElement, PlanHeaderProps>(function PlanHeader(
  { totalSeconds, skillCount, projectedFinish, badge },
  ref
) {
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
    <Panel ref={ref} title={t('plans.headerTitle')} className="lg:sticky lg:top-0 lg:z-20">
      {/* `lg:flex-nowrap` keeps this row a fixed one-line height at `lg`+;
          the toolbar's stacking offset below is measured live off this
          Panel's rendered height, so a chip (e.g. the remap-savings note)
          wrapping to a second row would still be picked up correctly, but
          nowrap keeps the header itself visually compact. `lg:overflow-x-auto`
          keeps any overflow reachable at the narrow end of `lg`. */}
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
});
