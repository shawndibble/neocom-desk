/**
 * One pilot's profile as Pilot Lookup shows it (issue #2331): identity, the
 * zKillboard stats, the ships they kill in most, and their recent kills and
 * losses. Shared with `PublicInfoModal`'s Character tab, which lazy-loads it —
 * so both places show a character the same way.
 *
 * Takes an already-loaded `PilotProfile`; each caller owns its own loading
 * and failure states. Where a corporation or alliance link goes is the
 * caller's too: Pilot Lookup opens the modal, the modal switches tabs.
 * Neither links to the modal's Character tab, which would only repeat this view.
 */
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { needsDangerRatio, threatVerdict } from '@/engine/pilotList/threatVerdict';
import { useNow } from '@/lib/useNow';
import { characterZkillUrl, fetchPilotStats, type PilotStatsResult } from '@/lib/zkillboard';
import { PilotKillActivityView, PilotStandingLine } from './PilotKillActivity';
import { PilotThreatSummary } from './PilotThreatSummary';
import { ThreatBadge } from './ThreatBadge';
import { usePilotKillHistory } from './usePilotKillHistory';
import { PilotKillmailsSection } from './PilotKillmailsSection';
import { ZkillRatioMeters, ZkillStatsSection } from './ZkillStatsSection';
import { pilotAge, type PilotProfile } from './pilotLookup';

export interface PilotProfileViewProps {
  profile: PilotProfile;
  /**
   * Inside Show Info the corporation / alliance names switch its tab instead
   * of opening it; without these they are `CorporationLink` / `AllianceLink`.
   */
  onOpenCorporation?: (corporationId: number) => void;
  onOpenAlliance?: (allianceId: number) => void;
  /** Hides the name heading where the surrounding dialog already titles it. */
  hideName?: boolean;
}

interface PilotIdentityProps extends PilotProfileViewProps {
  /** The Threat badge, drawn beside the name (alone where the dialog already titles it). */
  threat?: ReactNode;
}

/** Mount it keyed by the character id, so a new pilot never shows the last one's stats. */
export function PilotProfileView(props: PilotProfileViewProps) {
  const { characterId } = props.profile;
  const [stats, setStats] = useState<PilotStatsResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { history, retry: retryHistory } = usePilotKillHistory(characterId);
  const now = useNow();
  const pilotStats = stats?.kind === 'stats' ? stats.stats : null;

  // The verdict reads the kills and, for a pilot busy enough to be dangerous,
  // the danger ratio; until that ratio arrives the badge says it is checking
  // rather than showing a level that could still change.
  const threat = useMemo(() => {
    if (history.kind !== 'ready') return null;
    const verdict = threatVerdict({
      kills: history.kills,
      dangerRatio: pilotStats?.dangerRatio ?? null,
      nowMs: now,
    });
    return { verdict, pending: stats === null && needsDangerRatio(history.kills, now) };
  }, [history, pilotStats, stats, now]);

  useEffect(() => {
    let cancelled = false;
    void fetchPilotStats(characterId).then((result) => {
      if (!cancelled) setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt]);

  function retryStats() {
    setStats(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <PilotIdentity
        {...props}
        threat={threat && <ThreatBadge level={threat.pending ? 'pending' : threat.verdict.level} />}
      />
      {threat && !threat.pending && (
        <PilotThreatSummary
          verdict={threat.verdict}
          gangRatio={pilotStats?.gangRatio ?? null}
          nowMs={now}
        />
      )}
      <PilotStandingLine
        characterId={characterId}
        corporationId={props.profile.corporationId}
        allianceId={props.profile.allianceId}
      />
      {pilotStats && <ZkillRatioMeters stats={pilotStats} />}
      <PilotKillActivityView history={history} onRetry={retryHistory} />
      <ZkillStatsSection stats={stats} onRetry={retryStats} metersAbove />
      <PilotKillmailsSection characterId={characterId} />
    </div>
  );
}

export default PilotProfileView;

/**
 * The Corporation and Alliance links are this page's only way into those orgs,
 * two rows 2px apart: a 44px hit area on a phone, no overhang to overlap (#2520).
 */
const identityLinkClassName = 'inline-flex min-h-11 items-center md:min-h-0';

function PilotIdentity({
  profile,
  onOpenCorporation,
  onOpenAlliance,
  hideName = false,
  threat,
}: PilotIdentityProps) {
  const { t } = useTranslation();
  // Rendered once per lookup; "now" for an age in years and days needs no ticking.
  const [now] = useState(() => new Date());
  const age = pilotAge(profile.birthday, now);
  const { allianceId } = profile;
  const corporationLabel =
    profile.corporationName ?? t('travel.pilot.unnamed', { id: profile.corporationId });
  const allianceLabel = (id: number) => profile.allianceName ?? t('travel.pilot.unnamed', { id });
  return (
    <div className="flex flex-wrap items-start gap-4">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 space-y-1">
        {(!hideName || threat) && (
          <div className="flex flex-wrap items-center gap-2">
            {!hideName && <h2 className="text-lg font-semibold text-text">{profile.name}</h2>}
            {threat}
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-text-dim">{t('travel.pilot.corporation')}</dt>
          <dd>
            {onOpenCorporation ? (
              <button
                type="button"
                className={entityLinkClassName(identityLinkClassName)}
                onClick={() => onOpenCorporation(profile.corporationId)}
              >
                {corporationLabel}
              </button>
            ) : (
              <CorporationLink id={profile.corporationId} className={identityLinkClassName}>
                {corporationLabel}
              </CorporationLink>
            )}
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.alliance')}</dt>
          <dd>
            {allianceId === null ? (
              t('travel.pilot.noAlliance')
            ) : onOpenAlliance ? (
              <button
                type="button"
                className={entityLinkClassName(identityLinkClassName)}
                onClick={() => onOpenAlliance(allianceId)}
              >
                {allianceLabel(allianceId)}
              </button>
            ) : (
              <AllianceLink id={allianceId} className={identityLinkClassName}>
                {allianceLabel(allianceId)}
              </AllianceLink>
            )}
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.securityStatus')}</dt>
          <dd className="tabular-nums">
            {profile.securityStatus === null
              ? t('common.unknown')
              : profile.securityStatus.toFixed(1)}
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.age')}</dt>
          <dd>
            {age === null
              ? t('common.unknown')
              : t('travel.pilot.ageValue', {
                  years: t('travel.pilot.years', { count: age.years }),
                  days: t('travel.pilot.days', { count: age.days }),
                })}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          <ExternalLink href={characterZkillUrl(profile.characterId)}>
            {t('travel.pilot.zkillboard')}
          </ExternalLink>
        </div>
      </div>
    </div>
  );
}
