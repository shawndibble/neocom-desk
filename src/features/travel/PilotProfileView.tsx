/**
 * One pilot's profile as Pilot Lookup shows it (issue #2331): identity, the
 * zKillboard stats, the ships they kill in most, and their recent kills and
 * losses. Shared with `PublicInfoModal`'s Character tab, which lazy-loads it —
 * so both places show a character the same way.
 *
 * Takes an already-loaded `PilotProfile`; each caller owns its own loading
 * and failure states. Where a corporation, alliance or public-info link goes
 * is the caller's too: Pilot Lookup opens the modal, the modal switches tabs.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar, EmptyState, TypeIcon } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatIskCompact } from '@/lib/isk';
import { characterZkillUrl, fetchPilotStats, type PilotStatsResult } from '@/lib/zkillboard';
import { PilotKillmailsSection } from './PilotKillmailsSection';
import { pilotAge, type PilotProfile } from './pilotLookup';

export interface PilotProfileViewProps {
  profile: PilotProfile;
  onOpenCorporation: (corporationId: number) => void;
  onOpenAlliance: (allianceId: number) => void;
  /** Omitted where the view already is the public info, so it never links to itself. */
  onOpenPublicInfo?: () => void;
  /** Hides the name heading where the surrounding dialog already titles it. */
  hideName?: boolean;
}

/** Mount it keyed by the character id, so a new pilot never shows the last one's stats. */
export function PilotProfileView(props: PilotProfileViewProps) {
  const { characterId } = props.profile;
  const [stats, setStats] = useState<PilotStatsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPilotStats(characterId).then((result) => {
      if (!cancelled) setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return (
    <div className="space-y-4">
      <PilotIdentity {...props} />
      <PilotStatsSection stats={stats} />
      <PilotKillmailsSection characterId={characterId} />
    </div>
  );
}

export default PilotProfileView;

function PilotIdentity({
  profile,
  onOpenCorporation,
  onOpenAlliance,
  onOpenPublicInfo,
  hideName = false,
}: PilotProfileViewProps) {
  const { t } = useTranslation();
  // Rendered once per lookup; "now" for an age in years and days needs no ticking.
  const [now] = useState(() => new Date());
  const age = pilotAge(profile.birthday, now);
  const { allianceId } = profile;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <CharacterAvatar characterId={profile.characterId} size="lg" alt={profile.name} />
      <div className="min-w-0 space-y-1">
        {!hideName && <h2 className="text-lg font-semibold text-text">{profile.name}</h2>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-text-dim">{t('travel.pilot.corporation')}</dt>
          <dd>
            <button
              type="button"
              className={inlineLinkClassName}
              onClick={() => onOpenCorporation(profile.corporationId)}
            >
              {profile.corporationName ?? t('travel.pilot.unnamed', { id: profile.corporationId })}
            </button>
          </dd>
          <dt className="text-text-dim">{t('travel.pilot.alliance')}</dt>
          <dd>
            {allianceId === null ? (
              t('travel.pilot.noAlliance')
            ) : (
              <button
                type="button"
                className={inlineLinkClassName}
                onClick={() => onOpenAlliance(allianceId)}
              >
                {profile.allianceName ?? t('travel.pilot.unnamed', { id: allianceId })}
              </button>
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
          {onOpenPublicInfo && (
            <button type="button" className={inlineLinkClassName} onClick={onOpenPublicInfo}>
              {t('travel.pilot.publicInfo')}
            </button>
          )}
          <a
            href={characterZkillUrl(profile.characterId)}
            target="_blank"
            rel="noopener noreferrer"
            className={inlineLinkClassName}
          >
            {t('travel.pilot.zkillboard')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** A 0-1 share as a percentage; zKillboard's ratios are already 0-100, so they pass `scale` 1. */
function percent(value: number | null, digits = 0, scale = 100): string {
  return value === null ? '—' : `${(value * scale).toFixed(digits)}%`;
}

function PilotStatsSection({ stats }: { stats: PilotStatsResult | null }) {
  const { t } = useTranslation();
  if (stats === null) {
    return (
      <p role="status" className="text-text-dim">
        {t('travel.pilot.statsLoading')}
      </p>
    );
  }
  if (stats.kind === 'failed') {
    return (
      <EmptyState
        title={t('travel.pilot.statsFailedTitle')}
        hint={t('travel.pilot.statsFailedHint')}
      />
    );
  }
  if (stats.kind === 'no-history') {
    return (
      <EmptyState title={t('travel.pilot.noHistoryTitle')} hint={t('travel.pilot.noHistoryHint')} />
    );
  }
  const s = stats.stats;
  const figures: [string, string][] = [
    [t('travel.pilot.kills'), s.kills.toLocaleString()],
    [t('travel.pilot.losses'), s.losses.toLocaleString()],
    [t('travel.pilot.iskDestroyed'), formatIskCompact(s.iskDestroyed)],
    [t('travel.pilot.iskLost'), formatIskCompact(s.iskLost)],
    [t('travel.pilot.iskEfficiency'), percent(s.iskEfficiency, 1)],
    [t('travel.pilot.soloKills'), s.soloKills.toLocaleString()],
    [t('travel.pilot.dangerRatio'), percent(s.dangerRatio, 0, 1)],
    [t('travel.pilot.gangRatio'), percent(s.gangRatio, 0, 1)],
  ];
  return (
    <section aria-label={t('travel.pilot.statsLabel')} className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-xs border border-line bg-panel-2 px-3 py-2">
            <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {label}
            </dt>
            <dd className="text-base font-medium tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-text-dim">{t('travel.pilot.statsSource')}</p>
      {s.topShips.length > 0 && <TopShips ships={s.topShips} />}
    </section>
  );
}

function TopShips({ ships }: { ships: { shipTypeId: number; kills: number }[] }) {
  const { t } = useTranslation();
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const ids = ships.map((ship) => ship.shipTypeId).join(',');
  useEffect(() => {
    let cancelled = false;
    void loadTypeNames(ids.split(',').map(Number))
      .then((loaded) => {
        if (!cancelled) setNames(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.topShips')}
      </h3>
      <ul className="space-y-1">
        {ships.map((ship) => (
          <li key={ship.shipTypeId} className="flex items-center gap-2 text-sm">
            <TypeIcon typeId={ship.shipTypeId} size={32} width={24} height={24} />
            <span className="text-text">
              {names.get(ship.shipTypeId) ?? t('common.unknownType', { id: ship.shipTypeId })}
            </span>
            <span className="text-text-dim tabular-nums">
              {t('travel.pilot.shipKills', {
                count: ship.kills,
                formatted: ship.kills.toLocaleString(),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
