import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { MIN_MEANINGFUL_SAVINGS_SECONDS, type OptimisationBadge } from './planHeaderStats';

interface PlanHeaderProps {
  totalSeconds: number;
  skillCount: number;
  projectedFinish: Date | null;
  /** null when the plan has no valid entries to optimize. */
  badge: OptimisationBadge | null;
}

/** Plan-at-a-glance header: total time, skill count, projected finish, and a live remap-savings badge. */
export function PlanHeader({ totalSeconds, skillCount, projectedFinish, badge }: PlanHeaderProps) {
  const { t } = useTranslation();
  const savingsSeconds = badge?.savingsSeconds ?? 0;
  const showsSavings = badge !== null && savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;

  return (
    <Panel title={t('plans.headerTitle')}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span>
          <span className="text-text-dim">{t('plans.headerTrainingTime')}</span>{' '}
          <span className="tabular-nums font-semibold">{formatDuration(totalSeconds)}</span>
        </span>
        <span>
          <span className="text-text-dim">{t('plans.headerSkillCount')}</span>{' '}
          <span className="font-semibold">{skillCount}</span>
        </span>
        <span>
          <span className="text-text-dim">{t('plans.headerProjectedFinish')}</span>{' '}
          <span className="font-semibold">
            {projectedFinish ? projectedFinish.toLocaleDateString() : t('plans.headerNoFinish')}
          </span>
        </span>
        {badge && (
          <span
            className={`rounded-xs border px-2 py-0.5 ${
              showsSavings ? 'border-success/40 text-success' : 'border-line text-text-dim'
            }`}
          >
            {showsSavings
              ? t('plans.headerSavings', { duration: formatDuration(savingsSeconds) })
              : t('plans.headerNoSavings')}
            {badge.capped && (
              <span className="ml-1 text-text-faint">
                {t('plans.headerSavingsCapped', { evaluated: badge.evaluatedRemapCount })}
              </span>
            )}
          </span>
        )}
      </div>
    </Panel>
  );
}
