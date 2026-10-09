/**
 * The verdict band under a pilot's name: the Threat level in large type, the
 * sentence it was read from (recent kills and how long ago the last one was),
 * and chips for the facts that colour it: the kind of space they hunt in, how
 * often they fly in gangs and how many of their kills are pods. The "?" gives
 * the rule. The small badge beside the name is `ThreatBadge`; this band is the
 * same verdict spelled out.
 */
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import type { KillSpace } from '@/engine/pilotList/killActivity';
import {
  ACTIVE_MIN_KILLS,
  DANGEROUS_MIN_DANGER_RATIO,
  DANGEROUS_MIN_KILLER_RATIO,
  DANGEROUS_MIN_KILLS,
  THREAT_WINDOW_DAYS,
  type ThreatVerdict,
} from '@/engine/pilotList/threatVerdict';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import {
  THREAT_FILL_CLASS,
  THREAT_LEVEL_TONE,
  THREAT_PILL_CLASS,
  THREAT_TEXT_CLASS,
} from './threatTone';

/** A gang share from here up is worth a chip. */
const GANG_CHIP_MIN = 70;
/** A gang share up to here reads as mostly solo. */
const SOLO_CHIP_MAX = 30;
/** A pod share from here up is worth a chip. */
const POD_CHIP_MIN = 0.25;

/**
 * Every chip is neutral: the level word is the one loud colour on the band, and each chip
 * says in words what it is (a hot space or a gang share is not a second alarm).
 */
function Chip({ children }: { children: string }) {
  return (
    <li
      className={cx(
        'rounded-xs border px-1.5 py-px text-xs leading-4 whitespace-nowrap',
        THREAT_PILL_CLASS.neutral
      )}
    >
      {children}
    </li>
  );
}

export function PilotThreatBand({
  verdict,
  gangRatio,
  nowMs,
}: {
  verdict: ThreatVerdict;
  /** zKillboard's all-time gang ratio, 0-100; null when unknown. */
  gangRatio: number | null;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const tone = THREAT_LEVEL_TONE[verdict.level];
  const age = verdict.lastKillMs === null ? null : formatAge(nowMs - verdict.lastKillMs, t);
  const days = THREAT_WINDOW_DAYS;
  let sentence: string;
  if (verdict.recentKills === 0 && verdict.recentLosses > 0 && verdict.lastLossMs !== null) {
    sentence = t('travel.pilot.threat.lossesOnly', {
      count: verdict.recentLosses,
      days,
      age: formatAge(nowMs - verdict.lastLossMs, t),
    });
  } else if (verdict.recentKills === 0) {
    sentence =
      age === null
        ? t('travel.pilot.threat.inactive', { days })
        : t('travel.pilot.threat.inactiveLast', { age, days });
  } else {
    sentence = t('travel.pilot.threat.summary', { count: verdict.recentKills, days, age });
  }
  const space = (kind: KillSpace) => t(`common.spaceOption.${kind}`);
  const chips: { key: string; text: string }[] = [];
  if (verdict.mainSpace !== null) {
    chips.push({
      key: 'space',
      text: t('travel.pilot.threat.chip.space', { space: space(verdict.mainSpace) }),
    });
  }
  for (const also of verdict.alsoSpaces) {
    chips.push({
      key: `also-${also}`,
      text: t('travel.pilot.threat.chip.also', { space: space(also) }),
    });
  }
  // The gang ratio is all-time, so it says nothing about a pilot with no recent kills.
  const gangKnown = gangRatio !== null && verdict.level !== 'inactive';
  if (gangKnown && gangRatio >= GANG_CHIP_MIN) {
    chips.push({
      key: 'gangs',
      text: t('travel.pilot.threat.gangs', { value: Math.round(gangRatio) }),
    });
  } else if (gangKnown && gangRatio <= SOLO_CHIP_MAX) {
    chips.push({ key: 'solo', text: t('travel.pilot.threat.chip.solo') });
  }
  if (verdict.podShare !== null && verdict.podShare >= POD_CHIP_MIN) {
    chips.push({
      key: 'pods',
      text: t('travel.pilot.threat.pods', { value: Math.round(verdict.podShare * 100) }),
    });
  }
  return (
    <section
      aria-label={t('travel.pilot.threat.label')}
      className="grid overflow-hidden rounded-xs border border-line bg-panel-2 sm:grid-cols-[auto_1fr]"
    >
      <div
        className={cx(
          'flex min-w-32 flex-col justify-center gap-0.5 border-b border-line px-4 py-3 sm:border-r sm:border-b-0',
          THREAT_FILL_CLASS[tone]
        )}
      >
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('travel.pilot.threat.label')}
        </span>
        <span className={cx('text-lg font-bold tracking-wider uppercase', THREAT_TEXT_CLASS[tone])}>
          {t(`travel.pilot.threat.level.${verdict.level}`)}
        </span>
      </div>
      <div className="min-w-0 space-y-1.5 px-4 py-3">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-text">
          {sentence}
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('travel.pilot.threat.label') })}
            content={t('travel.pilot.threat.help', {
              days,
              dangerousKills: DANGEROUS_MIN_KILLS,
              dangerRatio: DANGEROUS_MIN_DANGER_RATIO,
              killerRatio: DANGEROUS_MIN_KILLER_RATIO,
              activeKills: ACTIVE_MIN_KILLS,
            })}
          />
        </p>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Chip key={chip.key}>{chip.text}</Chip>
            ))}
          </ul>
        )}
        {!verdict.ratiosKnown && verdict.recentKills >= DANGEROUS_MIN_KILLS && (
          <p className="text-xs text-warning">{t('travel.pilot.threat.dangerUnknown')}</p>
        )}
      </div>
    </section>
  );
}
