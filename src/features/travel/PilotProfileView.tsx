/**
 * One pilot's profile as Pilot Lookup shows it (issue #2331): a compact
 * identity header with the Threat badge, the verdict band, the three meters,
 * where they kill, the ships they fly and kill, their all-time figures, and
 * their recent kills and losses. Shared with `PublicInfoModal`'s Character tab,
 * which lazy-loads it — so both places show a character the same way.
 *
 * Takes an already-loaded `PilotProfile`; each caller owns its own loading
 * and failure states. Where a corporation or alliance link goes is the
 * caller's too: Pilot Lookup opens the modal, the modal switches tabs.
 * Neither links to the modal's Character tab, which would only repeat this view.
 */
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { AllianceLink, CorporationLink } from '@/features/entities';
import {
  needsDangerRatio,
  needsLossHistory,
  threatVerdict,
} from '@/engine/pilotList/threatVerdict';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/useNow';
import { characterZkillUrl, fetchPilotStats, type PilotStatsResult } from '@/lib/zkillboard';
import { PilotKillActivityView, PilotStandingLine } from './PilotKillActivity';
import { PilotShips } from './PilotShips';
import { PilotThreatBand } from './PilotThreatBand';
import { usePilotKillHistory } from './usePilotKillHistory';
import { usePilotLossTimes } from './usePilotLossTimes';
import { killerRatio } from './zkillFigures';
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

/** Mount it keyed by the character id, so a new pilot never shows the last one's stats. */
export function PilotProfileView(props: PilotProfileViewProps) {
  const { t } = useTranslation();
  const { characterId } = props.profile;
  const [stats, setStats] = useState<PilotStatsResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { history, retry: retryHistory } = usePilotKillHistory(characterId);
  const now = useNow();
  const pilotStats = stats?.kind === 'stats' ? stats.stats : null;

  // A pilot with no recent kill is "inactive" unless they lost a ship lately, so
  // their losses are read (from the list Recent kills and losses already loads).
  const needsLosses = history.kind === 'ready' && needsLossHistory(history.kills, now);
  const losses = usePilotLossTimes(characterId, needsLosses);
  // Their losses could not be read or dated: "inactive" would be a guess, so there is no verdict.
  const lossesUnreadable =
    needsLosses &&
    (losses.kind === 'failed' || (losses.kind === 'ready' && losses.timesMs === null));

  // The verdict reads the kills and, for a pilot busy enough to be dangerous,
  // the two ratios; until those arrive (or the losses, for a pilot with no
  // recent kill) the badge says it is checking rather than showing a level
  // that could still change.
  const threat = useMemo(() => {
    if (history.kind !== 'ready' || lossesUnreadable) return null;
    const verdict = threatVerdict({
      kills: history.kills,
      dangerRatio: pilotStats?.dangerRatio ?? null,
      killerRatio: pilotStats ? killerRatio(pilotStats) : null,
      lossTimesMs: losses.kind === 'ready' ? losses.timesMs : null,
      nowMs: now,
    });
    const waitingForRatios = stats === null && needsDangerRatio(history.kills, now);
    const waitingForLosses = needsLosses && losses.kind === 'loading';
    return { verdict, pending: waitingForRatios || waitingForLosses };
  }, [history, pilotStats, stats, losses, needsLosses, lossesUnreadable, now]);

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
    <div className="@container/profile space-y-4">
      <PilotIdentity {...props} />
      {threat && !threat.pending && (
        <PilotThreatBand
          verdict={threat.verdict}
          gangRatio={pilotStats?.gangRatio ?? null}
          nowMs={now}
        />
      )}
      {lossesUnreadable && (
        <p className="text-xs text-text-dim">{t('travel.pilot.threat.lossesUnknown')}</p>
      )}
      <PilotStandingLine
        characterId={characterId}
        corporationId={props.profile.corporationId}
        allianceId={props.profile.allianceId}
      />
      {/* The chart is the section the eye wants, so on a wide profile it takes the left, with "How
          they fight" beside it; on a phone the meters come first, as a row, and the chart under. */}
      <div
        className={cx(
          'grid gap-3',
          pilotStats !== null && '@3xl/profile:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]'
        )}
      >
        {pilotStats && (
          <div className="order-first h-full @3xl/profile:order-last">
            <ZkillRatioMeters stats={pilotStats} />
          </div>
        )}
        <PilotKillActivityView history={history} onRetry={retryHistory} />
      </div>
      <PilotShips
        kills={history.kind === 'ready' ? history.kills : null}
        flown={pilotStats?.topShips ?? null}
      />
      <ZkillStatsSection stats={stats} onRetry={retryStats} />
      <PilotKillmailsSection characterId={characterId} />
    </div>
  );
}

export default PilotProfileView;

/**
 * The compact header: the portrait, then name and badge, corporation and alliance, and a facts line.
 * Its links stay text height on a phone: the header is three tight lines beside a portrait, and a 44px
 * box around each one pushed them apart more than it helped a thumb (see DESIGN.md "Touch tier").
 */
function PilotIdentity({
  profile,
  onOpenCorporation,
  onOpenAlliance,
  hideName = false,
}: PilotProfileViewProps) {
  const { t } = useTranslation();
  // Rendered once per lookup; "now" for an age in years and days needs no ticking.
  const [now] = useState(() => new Date());
  const age = pilotAge(profile.birthday, now);
  const { allianceId } = profile;
  const corporationLabel =
    profile.corporationName ?? t('travel.pilot.unnamed', { id: profile.corporationId });
  const allianceLabel = (id: number) => profile.allianceName ?? t('travel.pilot.unnamed', { id });
  return (
    <div className="flex items-start gap-3">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 space-y-0.5">
        {!hideName && <h2 className="text-lg font-semibold text-text">{profile.name}</h2>}
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <span className="sr-only">{t('travel.pilot.corporation')}: </span>
          {onOpenCorporation ? (
            <button
              type="button"
              className={entityLinkClassName()}
              onClick={() => onOpenCorporation(profile.corporationId)}
            >
              {corporationLabel}
            </button>
          ) : (
            <CorporationLink id={profile.corporationId}>{corporationLabel}</CorporationLink>
          )}
          <span aria-hidden className="text-text-dim">
            ·
          </span>
          <span className="sr-only">{t('travel.pilot.alliance')}: </span>
          {allianceId === null ? (
            <span className="text-text-dim">{t('travel.pilot.noAlliance')}</span>
          ) : onOpenAlliance ? (
            <button
              type="button"
              className={entityLinkClassName()}
              onClick={() => onOpenAlliance(allianceId)}
            >
              {allianceLabel(allianceId)}
            </button>
          ) : (
            <AllianceLink id={allianceId}>{allianceLabel(allianceId)}</AllianceLink>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
          <span>
            {t('travel.pilot.securityStatus')}{' '}
            <b className="font-medium text-text tabular-nums">
              {profile.securityStatus === null
                ? t('common.unknown')
                : profile.securityStatus.toFixed(1)}
            </b>
          </span>
          <span>
            {t('travel.pilot.age')}{' '}
            <b className="font-medium text-text">
              {age === null
                ? t('common.unknown')
                : t('travel.pilot.ageValue', {
                    years: t('travel.pilot.years', { count: age.years }),
                    days: t('travel.pilot.days', { count: age.days }),
                  })}
            </b>
          </span>
          <ExternalLink href={characterZkillUrl(profile.characterId)}>
            {t('travel.pilot.zkillboard')}
          </ExternalLink>
        </p>
      </div>
    </div>
  );
}
