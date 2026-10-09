/**
 * The plain-language line under a pilot's name: what the Threat verdict was
 * read from (recent kills, where, how long ago) and the two facts that colour
 * it, how often they fly in gangs and how many of their kills are pods. The
 * badge itself is `ThreatBadge`; this is the sentence that explains it, with
 * the rule one tap away in the "?" tooltip.
 */
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import {
  ACTIVE_MIN_KILLS,
  DANGEROUS_MIN_DANGER_RATIO,
  DANGEROUS_MIN_KILLS,
  THREAT_WINDOW_DAYS,
  type ThreatVerdict,
} from '@/engine/pilotList/threatVerdict';
import { formatAge } from '@/lib/age';

/** A gang share from here up is worth saying; below it, solo is the norm worth nothing. */
const GANG_NOTE_MIN = 70;
/** A pod share from here up is worth saying. */
const POD_NOTE_MIN = 0.25;

export function PilotThreatSummary({
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
  const age = verdict.lastKillMs === null ? null : formatAge(nowMs - verdict.lastKillMs, t);
  let sentence: string;
  if (verdict.recentKills === 0) {
    sentence =
      age === null
        ? t('travel.pilot.threat.inactive', { days: THREAT_WINDOW_DAYS })
        : t('travel.pilot.threat.inactiveLast', { age, days: THREAT_WINDOW_DAYS });
  } else if (verdict.mainSpace === null) {
    sentence = t('travel.pilot.threat.summary', {
      count: verdict.recentKills,
      days: THREAT_WINDOW_DAYS,
      age,
    });
  } else {
    sentence = t('travel.pilot.threat.summaryIn', {
      count: verdict.recentKills,
      days: THREAT_WINDOW_DAYS,
      space: t(`common.spaceOption.${verdict.mainSpace}`).toLowerCase(),
      age,
    });
  }
  const facts: string[] = [];
  if (gangRatio !== null && gangRatio >= GANG_NOTE_MIN) {
    facts.push(t('travel.pilot.threat.gangs', { value: Math.round(gangRatio) }));
  }
  if (verdict.podShare !== null && verdict.podShare >= POD_NOTE_MIN) {
    facts.push(t('travel.pilot.threat.pods', { value: Math.round(verdict.podShare * 100) }));
  }
  return (
    <div className="space-y-0.5 text-sm">
      <p className="flex flex-wrap items-center gap-x-1.5 text-text">
        {sentence}
        <InfoTooltip
          label={t('common.aboutLabel', { label: t('travel.pilot.threat.label') })}
          content={t('travel.pilot.threat.help', {
            days: THREAT_WINDOW_DAYS,
            dangerousKills: DANGEROUS_MIN_KILLS,
            dangerRatio: DANGEROUS_MIN_DANGER_RATIO,
            activeKills: ACTIVE_MIN_KILLS,
          })}
        />
      </p>
      {facts.length > 0 && <p className="text-xs text-text-dim">{facts.join(' · ')}</p>}
      {!verdict.dangerKnown && verdict.recentKills >= DANGEROUS_MIN_KILLS && (
        <p className="text-xs text-warning">{t('travel.pilot.threat.dangerUnknown')}</p>
      )}
    </div>
  );
}
