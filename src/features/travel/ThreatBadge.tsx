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
import { THREAT_LEVEL_TONE, THREAT_PILL_CLASS } from './threatTone';

export function ThreatBadge({
  level,
  className,
  solid = false,
}: {
  level: ThreatLevel | 'pending';
  className?: string;
  /** Fills a Dangerous badge solid, for a list row where it has to read at a glance. */
  solid?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1.5 py-px text-[0.6875rem] leading-4 font-semibold tracking-widest whitespace-nowrap uppercase',
        THREAT_PILL_CLASS[THREAT_LEVEL_TONE[level]],
        solid && level === 'dangerous' && 'border-danger! bg-danger! text-accent-contrast!',
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
