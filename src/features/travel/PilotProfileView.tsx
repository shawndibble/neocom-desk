import { fixed1 } from '@/lib/fixedFormat';
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
import { threatInContext } from '@/engine/pilotList/threatContext';
import { PilotThreatBand } from './PilotThreatBand';
import { useHereSpace } from './useHereSpace';
import { useLocalThreatContext } from './localThreatContext';
import { usePilotKillHistory } from './usePilotKillHistory';
import { usePilotLossTimes } from './usePilotLossTimes';
import { killerRatio } from './zkillFigures';
import { PilotKillmailsSection } from './PilotKillmailsSection';
import { ZkillRatioMeters, ZkillStatsSection } from './ZkillStatsSection';
import { pilotAge, type PilotProfile } from './pilotLookup';
import { AchievementLine } from '@/features/character/AchievementLine';
import { useAchievementParts } from '@/features/character/useCharacterAchievements';

export interface PilotProfileViewProps {
  profile: PilotProfile;
  onOpenCorporation?: (corporationId: number) => void;
  onOpenAlliance?: (allianceId: number) => void;
  hideName?: boolean;
}

export function PilotProfileView(props: PilotProfileViewProps) {
  const { t } = useTranslation();
  const { characterId } = props.profile;
  const [stats, setStats] = useState<PilotStatsResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { history, retry: retryHistory } = usePilotKillHistory(characterId);
  const now = useNow();
  const hereSpace = useHereSpace().space;
  const orgMatesHere = useLocalThreatContext((state) => state.matesById.get(characterId) ?? null);
  const pilotStats = stats?.kind === 'stats' ? stats.stats : null;
  const zkillDown = stats?.kind === 'failed';
  const killsUnknown = zkillDown && history.kind === 'ready' && history.kills.length === 0;

  const needsLosses = history.kind === 'ready' && needsLossHistory(history.kills, now);
  const losses = usePilotLossTimes(characterId, needsLosses);
  const lossesUnreadable =
    needsLosses &&
    (losses.kind === 'failed' || (losses.kind === 'ready' && losses.timesMs === null));

  const threat = useMemo(() => {
    if (history.kind !== 'ready' || lossesUnreadable || killsUnknown) return null;
    const verdict = threatVerdict({
      kills: history.kills,
      dangerRatio: pilotStats?.dangerRatio ?? null,
      killerRatio: pilotStats ? killerRatio(pilotStats) : null,
      lossTimesMs: losses.kind === 'ready' ? losses.timesMs : null,
      nowMs: now,
    });
    const waitingForRatios = stats === null && needsDangerRatio(history.kills, now);
    const waitingForLosses = needsLosses && losses.kind === 'loading';
    const read = threatInContext(verdict.level, history.kills, now, { hereSpace, orgMatesHere });
    return {
      verdict: { ...verdict, level: read.level },
      read,
      pending: waitingForRatios || waitingForLosses,
    };
  }, [
    history,
    pilotStats,
    stats,
    losses,
    needsLosses,
    lossesUnreadable,
    killsUnknown,
    now,
    hereSpace,
    orgMatesHere,
  ]);

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
    if (history.kind === 'failed') retryHistory();
  }
  const hideActivity = killsUnknown || (zkillDown && history.kind === 'failed');

  return (
    <div className="@container/profile space-y-4">
      <PilotIdentity {...props} />
      {threat && !threat.pending && (
        <PilotThreatBand
          verdict={threat.verdict}
          gangRatio={pilotStats?.gangRatio ?? null}
          nowMs={now}
          context={{ read: threat.read, hereSpace, orgMatesHere }}
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
      {zkillDown && <ZkillStatsSection stats={stats} onRetry={retryStats} />}
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
        {!hideActivity && <PilotKillActivityView history={history} onRetry={retryHistory} />}
      </div>
      <PilotShips
        kills={history.kind === 'ready' ? history.kills : null}
        flown={pilotStats?.topShips ?? null}
      />
      {!zkillDown && <ZkillStatsSection stats={stats} onRetry={retryStats} />}
      <PilotKillmailsSection characterId={characterId} unknown={zkillDown} />
    </div>
  );
}

export default PilotProfileView;

function PilotIdentity({
  profile,
  onOpenCorporation,
  onOpenAlliance,
  hideName = false,
}: PilotProfileViewProps) {
  const { t } = useTranslation();
  const [now] = useState(() => new Date());
  const age = pilotAge(profile.birthday, now);
  const { allianceId } = profile;
  const corporationLabel =
    profile.corporationName ?? t('travel.pilot.unnamed', { id: profile.corporationId });
  const allianceLabel = (id: number) => profile.allianceName ?? t('travel.pilot.unnamed', { id });
  const achievementParts = useAchievementParts(profile.achievement);
  return (
    <div className="flex items-start gap-3">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 space-y-0.5">
        {!hideName && <h2 className="text-xl font-semibold text-text">{profile.name}</h2>}
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
        <AchievementLine parts={achievementParts} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
          <span>
            {t('travel.pilot.securityStatus')}{' '}
            <b className="font-medium text-text tabular-nums">
              {profile.securityStatus === null
                ? t('common.unknown')
                : fixed1(profile.securityStatus)}
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
