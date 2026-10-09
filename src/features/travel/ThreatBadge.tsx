/**
 * The Threat verdict as a small colour-coded badge, drawn beside a pilot's
 * name on the profile and in every Local list row. The word is always there:
 * colour alone never carries it. There is no green level, because the verdict
 * reads kills only and so can never say a pilot is harmless
 * (decision `20261008-181210`). `pending` stands in while the one thing a
 * row is still waiting for, the danger ratio, decides between two levels.
 */
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';

const LEVEL_CLASS: Record<ThreatLevel | 'pending', string> = {
  dangerous: 'border-danger/60 bg-danger/10 text-danger',
  active: 'border-warning/60 bg-warning/10 text-warning',
  low: 'border-line-bright bg-panel-2 text-text',
  inactive: 'border-line bg-transparent text-text-dim',
  pending: 'border-line bg-transparent text-text-dim',
};

export function ThreatBadge({
  level,
  className,
}: {
  level: ThreatLevel | 'pending';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1.5 py-px text-[0.6875rem] leading-4 font-semibold tracking-widest whitespace-nowrap uppercase',
        LEVEL_CLASS[level],
        className
      )}
    >
      <span className="sr-only">{t('travel.pilot.threat.label')}: </span>
      {level === 'pending'
        ? t('travel.pilot.threat.pending')
        : t(`travel.pilot.threat.level.${level}`)}
    </span>
  );
}
