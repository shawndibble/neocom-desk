import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { ThreatLevel } from '@/engine/pilotList/threatVerdict';
import { THREAT_LEVEL_TONE, THREAT_PILL_CLASS } from './threatTone';

const LEVEL_ICON = {
  dangerous: Icon.SeverityCritical,
  active: Icon.Warn,
  low: Icon.SeverityWatch,
  inactive: Icon.Pending,
  pending: Icon.Pending,
} as const;

export function ThreatBadge({
  level,
  className,
  solid = false,
  adjusted = null,
}: {
  level: ThreatLevel | 'pending';
  className?: string;
  solid?: boolean;
  adjusted?: 'down' | 'up' | null;
}) {
  const { t } = useTranslation();
  const LevelIcon = LEVEL_ICON[level];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-xs border px-1.5 py-px text-[0.6875rem] leading-4 font-semibold tracking-widest whitespace-nowrap uppercase',
        THREAT_PILL_CLASS[THREAT_LEVEL_TONE[level]],
        solid && level === 'dangerous' && 'border-danger! bg-danger! text-accent-contrast!',
        className
      )}
    >
      <LevelIcon size={12} aria-hidden />
      {level === 'pending' ? (
        <>
          <span className="sr-only">{t('travel.pilot.threat.label')}: </span>
          {t('travel.pilot.threat.pending')}
        </>
      ) : (
        <>
          <span className="sr-only">
            {t('travel.pilot.threat.label')}: {t(`travel.pilot.threat.levelFull.${level}`)}
          </span>
          <span aria-hidden>{t(`travel.pilot.threat.level.${level}`)}</span>
        </>
      )}
      {adjusted !== null && (
        <>
          {adjusted === 'down' ? (
            <Icon.LevelLower className="size-3" aria-hidden />
          ) : (
            <Icon.LevelHigher className="size-3" aria-hidden />
          )}
          <span className="sr-only">{t(`travel.pilot.threat.adjusted.${adjusted}`)}</span>
        </>
      )}
    </span>
  );
}
