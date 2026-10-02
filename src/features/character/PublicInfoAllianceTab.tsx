/**
 * Alliance tab body for `PublicInfoModal`, laid out like the Corporation tab
 * so the two read as one design: who the alliance is (logo, ticker, executor,
 * founder and founding corporation, founding date), how it fights (the
 * Snuggly↔Dangerous and Solo↔Gang meters first, then one line of figures and
 * its most-flown hulls), and who is in it — every member corporation, each
 * opening in the modal. Lazy-loaded, like the other tabs.
 *
 * The alliance record is loaded by the modal; the parts hanging off it —
 * zKillboard stats, the member list, the names — load here, each on its own,
 * so one slow or failed lookup never blanks the rest. The pilot count is
 * zKillboard's own (`memberCount`): ESI states no alliance-wide headcount,
 * and summing every member corp's record would cost a request per corp.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { allianceLogoUrl } from '@/lib/eveImages';
import { allianceZkillUrl, fetchAllianceStats, type PilotStatsResult } from '@/lib/zkillboard';
import {
  StatTiles,
  ZkillRatioMeters,
  ZkillStatsStatus,
  ZkillTopShips,
} from '@/features/travel/ZkillStatsSection';
import { killFigures, type StatTileItem } from '@/features/travel/zkillFigures';
import { corporationAge } from './corporationInfo';
import { resolveNames } from './names';
import {
  loadPublicAllianceCorporations,
  type PublicAllianceCorporations,
  type PublicAllianceInfo,
} from './publicInfoData';
import { CorporationLink, PersonLink } from './PublicInfoParts';
import {
  FACT_COLUMNS,
  externalLinkClassName,
  fullDate,
  sectionHeading,
  termClassName,
} from './publicInfoStyles';

export interface PublicInfoAllianceTabProps {
  data: PublicAllianceInfo;
  /** Opens a pilot (the founder) in the modal, replacing this request. */
  onShowCharacter: (characterId: number) => void;
  /** Opens a corporation (the executor, a member) in the modal, replacing this request. */
  onShowCorporation: (corporationId: number) => void;
}

export default function PublicInfoAllianceTab({
  data,
  onShowCharacter,
  onShowCorporation,
}: PublicInfoAllianceTabProps) {
  const { t } = useTranslation();
  const allianceId = data.alliance_id;
  const [now] = useState(() => new Date());
  const [stats, setStats] = useState<PilotStatsResult | null>(null);
  const [members, setMembers] = useState<PublicAllianceCorporations | null>(null);
  const [names, setNames] = useState<Map<number, string>>(new Map());

  const executorId = data.executor_corporation_id;
  const nameIds = [data.creator_id, data.creator_corporation_id, executorId, data.faction_id]
    .filter((id): id is number => id !== undefined)
    .join(',');

  useEffect(() => {
    let cancelled = false;
    void fetchAllianceStats(allianceId).then((result) => {
      if (!cancelled) setStats(result);
    });
    void loadPublicAllianceCorporations(allianceId)
      .then((result) => {
        if (!cancelled) setMembers(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [allianceId]);

  useEffect(() => {
    let cancelled = false;
    void resolveNames(nameIds.split(',').map(Number))
      .then((resolved) => {
        if (!cancelled) setNames(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nameIds]);

  const name = (id: number) => names.get(id) ?? null;
  const age = corporationAge(data.date_founded, now);
  const ready = stats?.kind === 'stats' ? stats.stats : null;
  const figures = killFigures(t, ready);
  const corporationCount = members?.corporations.length;
  const facts: StatTileItem[] = [
    {
      label: t('publicInfo.corporations'),
      value: corporationCount === undefined ? '—' : corporationCount.toLocaleString(),
    },
    ...(ready?.memberCount != null
      ? [{ label: t('publicInfo.pilots'), value: ready.memberCount.toLocaleString() }]
      : []),
    {
      label: t('publicInfo.age'),
      value:
        age === null
          ? t('common.unknown')
          : t('publicInfo.ageValue', { years: age.years, months: age.months }),
    },
    figures.kills,
    figures.losses,
    figures.iskDestroyed,
  ];

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <img
          src={allianceLogoUrl(allianceId, 128)}
          crossOrigin="anonymous"
          alt=""
          width={96}
          height={96}
          className="size-16 shrink-0 rounded-xs border border-line sm:size-24"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-text-dim">[{data.ticker}]</p>
          {executorId !== undefined && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={termClassName}>{t('publicInfo.executor')}</span>
              <CorporationLink id={executorId} name={name(executorId)} onOpen={onShowCorporation} />
            </p>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <a
            href={allianceZkillUrl(allianceId)}
            target="_blank"
            rel="noopener noreferrer"
            className={externalLinkClassName}
          >
            {t('publicInfo.zkillboard')} <span aria-hidden>↗</span>
          </a>
        </div>
      </div>

      {ready && <ZkillRatioMeters stats={ready} />}

      <StatTiles items={facts} className={FACT_COLUMNS[facts.length]} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-5 self-start">
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <dt className={termClassName}>{t('publicInfo.founder')}</dt>
            <dd>
              <PersonLink
                id={data.creator_id}
                name={name(data.creator_id)}
                onOpen={onShowCharacter}
              />
            </dd>
            <dt className={termClassName}>{t('publicInfo.foundingCorporation')}</dt>
            <dd className="min-w-0">
              <CorporationLink
                id={data.creator_corporation_id}
                name={name(data.creator_corporation_id)}
                onOpen={onShowCorporation}
              />
            </dd>
            <dt className={termClassName}>{t('publicInfo.founded')}</dt>
            <dd>{fullDate(data.date_founded)}</dd>
            {data.faction_id !== undefined && (
              <>
                <dt className={termClassName}>{t('publicInfo.faction')}</dt>
                <dd>{name(data.faction_id) ?? `#${data.faction_id}`}</dd>
              </>
            )}
          </dl>
          {ready && ready.topShips.length > 0 && <ZkillTopShips ships={ready.topShips} />}
        </div>

        {members && members.corporations.length > 0 && (
          <section className="min-w-0 space-y-1.5" aria-label={t('publicInfo.memberCorporations')}>
            <h3 className={sectionHeading}>
              {t('publicInfo.memberCorporationsCount', {
                count: members.corporations.length,
                formatted: members.corporations.length.toLocaleString(),
              })}
            </h3>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-xs border border-line bg-bg p-2">
              {members.corporations.map((corporation) => (
                <li key={corporation.id}>
                  <CorporationLink
                    id={corporation.id}
                    name={corporation.name}
                    onOpen={onShowCorporation}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {ready ? (
        <p className="text-xs text-text-dim">{t('travel.pilot.statsSource')}</p>
      ) : (
        <ZkillStatsStatus stats={stats} subject="alliance" />
      )}
    </div>
  );
}
