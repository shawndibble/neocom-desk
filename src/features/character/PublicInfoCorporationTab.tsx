/**
 * Corporation tab body for `PublicInfoModal`: who the corporation is (logo,
 * ticker, alliance, founding, CEO and founder, home station, its own
 * description), how it fights (zKillboard's Snuggly↔Dangerous and Solo↔Gang
 * meters first — the question a reader opening a corp mostly came with — then
 * one line of figures and its most-flown hulls), and the alliances it has
 * been in. Lazy-loaded, like the Employment tab.
 *
 * The corp record itself is loaded by the modal, which owns the tab's
 * loading/error state; the parts that hang off it — stats, alliance history,
 * station and faction names — load here, each on its own, so one slow or
 * failed lookup never blanks the rest of the tab.
 *
 * An NPC corporation (CCP's id block, `isNpcCorporationId`) shows its faction
 * and skips the killboard and the alliance history: neither means anything
 * for a corporation no player runs.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { EveMarkupText } from '@/components/EveMarkupText';
import { isNpcCorporationId } from '@/esi/entityIds';
import { allianceLogoUrl, corporationLogoUrl } from '@/lib/eveImages';
import {
  corporationZkillUrl,
  fetchCorporationStats,
  type PilotStatsResult,
} from '@/lib/zkillboard';
import {
  StatTiles,
  ZkillRatioMeters,
  ZkillStatsNote,
  ZkillTopShips,
} from '@/features/travel/ZkillStatsSection';
import { killFigures, type StatTileItem } from '@/features/travel/zkillFigures';
import { corporationAge, corporationTaxPercent } from './corporationInfo';
import {
  loadPublicAllianceHistory,
  type PublicAllianceHistory,
  type PublicCorporationInfo,
} from './publicInfoData';
import { loadStationName } from './stations';
import { useEntityName } from './useEntityName';
import { AllianceLink } from '@/features/entities';
import { PersonLink } from './PublicInfoParts';
import {
  FACT_COLUMNS,
  externalLinkClassName,
  fullDate,
  monthYear,
  sectionHeading,
  statusWordClassName,
  termClassName,
  websiteUrl,
} from './publicInfoStyles';

export interface PublicInfoCorporationTabProps {
  data: PublicCorporationInfo;
  /** The alliance to show: a character's live one, else the corp record's. Null for none. */
  allianceId: number | null;
  allianceName?: string;
  onOpenAlliance?: () => void;
}

export default function PublicInfoCorporationTab({
  data,
  allianceId,
  allianceName,
  onOpenAlliance,
}: PublicInfoCorporationTabProps) {
  const { t } = useTranslation();
  const corporationId = data.corporation_id;
  const npc = isNpcCorporationId(corporationId);
  const [now] = useState(() => new Date());
  const [stats, setStats] = useState<PilotStatsResult | null>(null);
  const [history, setHistory] = useState<PublicAllianceHistory | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const factionName = useEntityName(data.faction_id);

  useEffect(() => {
    let cancelled = false;
    if (!npc) {
      void fetchCorporationStats(corporationId).then((result) => {
        if (!cancelled) setStats(result);
      });
      void loadPublicAllianceHistory(corporationId)
        .then((result) => {
          if (!cancelled) setHistory(result);
        })
        .catch(() => {});
    }
    if (data.home_station_id !== undefined) {
      void loadStationName(data.home_station_id)
        .then((name) => {
          if (!cancelled) setStationName(name);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [corporationId, npc, data.home_station_id]);

  const age = corporationAge(data.date_founded, now);
  const website = websiteUrl(data.url);
  const description = data.description?.trim() ?? '';
  // When it joined its current alliance: the newest stint, if that is this alliance.
  const current = history?.rows[0];
  const allianceSince =
    allianceId !== null && current?.allianceId === allianceId ? current.startDate : null;

  const taxPercent = corporationTaxPercent(data);
  const ready = stats?.kind === 'stats' ? stats.stats : null;
  const figures = killFigures(t, ready);
  // One line: who it is (members, age, tax), then how it fights. Tax only when
  // ESI states it; the zKillboard figures only for a corp players run.
  const facts: StatTileItem[] = [
    { label: t('publicInfo.memberCount'), value: data.member_count.toLocaleString() },
    {
      label: t('publicInfo.age'),
      value:
        age === null
          ? t('common.unknown')
          : t('publicInfo.ageValue', { years: age.years, months: age.months }),
    },
    ...(taxPercent === null
      ? []
      : [{ label: t('publicInfo.taxRate'), value: `${taxPercent.toLocaleString()}%` }]),
    ...(npc ? [] : [figures.kills, figures.losses, figures.iskDestroyed]),
  ];

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <img
          src={corporationLogoUrl(corporationId, 128)}
          crossOrigin="anonymous"
          alt=""
          width={96}
          height={96}
          className="size-16 shrink-0 rounded-xs border border-line sm:size-24"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-text-dim">[{data.ticker}]</p>
          {allianceId !== null && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <img
                src={allianceLogoUrl(allianceId, 32)}
                crossOrigin="anonymous"
                alt=""
                width={16}
                height={16}
                className="shrink-0 rounded-xs"
              />
              {onOpenAlliance ? (
                <button type="button" onClick={onOpenAlliance} className={inlineLinkClassName}>
                  {allianceName ?? `#${allianceId}`}
                </button>
              ) : (
                <span>{allianceName ?? `#${allianceId}`}</span>
              )}
              {allianceSince && (
                <span className="text-xs text-text-dim">
                  {t('publicInfo.allianceSince', { date: monthYear(allianceSince) })}
                </span>
              )}
            </p>
          )}
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span className={`${statusWordClassName} text-text-dim`}>
              {npc ? t('publicInfo.npcCorporation') : t('publicInfo.playerCorporation')}
            </span>
            {data.war_eligible && (
              <span className={`${statusWordClassName} text-warning`}>
                {t('publicInfo.warEligible')}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {!npc && (
            <a
              href={corporationZkillUrl(corporationId)}
              target="_blank"
              rel="noopener noreferrer"
              className={externalLinkClassName}
            >
              {t('publicInfo.zkillboard')} <span aria-hidden>↗</span>
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className={externalLinkClassName}
            >
              {t('publicInfo.website')} <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      </div>

      {ready && <ZkillRatioMeters stats={ready} />}

      <StatTiles items={facts} className={FACT_COLUMNS[facts.length]} />
      {!npc && <ZkillStatsNote stats={stats} subject="corporation" />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-5 self-start">
          <dl className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2">
            <dt className={termClassName}>{t('publicInfo.ceo')}</dt>
            <dd>
              <PersonLink id={data.ceo_id} name={data.ceoName} />
            </dd>
            <dt className={termClassName}>{t('publicInfo.founder')}</dt>
            <dd>
              <PersonLink id={data.creator_id} name={data.creatorName} />
            </dd>
            {data.date_founded && (
              <>
                <dt className={termClassName}>{t('publicInfo.founded')}</dt>
                <dd>{fullDate(data.date_founded)}</dd>
              </>
            )}
            {data.home_station_id !== undefined && (
              <>
                <dt className={termClassName}>{t('publicInfo.homeStation')}</dt>
                <dd>{stationName ?? `#${data.home_station_id}`}</dd>
              </>
            )}
            {data.faction_id !== undefined && (
              <>
                <dt className={termClassName}>{t('publicInfo.faction')}</dt>
                <dd>{factionName ?? `#${data.faction_id}`}</dd>
              </>
            )}
            {data.shares !== undefined && (
              <>
                <dt className={termClassName}>{t('publicInfo.shares')}</dt>
                <dd className="tabular-nums">{data.shares.toLocaleString()}</dd>
              </>
            )}
          </dl>
          {ready && ready.topShips.length > 0 && <ZkillTopShips ships={ready.topShips} />}
        </div>

        <div className="min-w-0 space-y-4">
          {description !== '' && (
            <section className="space-y-1.5" aria-label={t('publicInfo.description')}>
              <h3 className={sectionHeading}>{t('publicInfo.description')}</h3>
              <div className="max-h-48 overflow-y-auto rounded-xs border border-line bg-bg p-3">
                <EveMarkupText markup={description} className="text-text" />
              </div>
            </section>
          )}
          {history && history.rows.length > 0 && (
            <section className="space-y-1.5" aria-label={t('publicInfo.allianceHistory')}>
              <h3 className={sectionHeading}>{t('publicInfo.allianceHistory')}</h3>
              <ol className="border-l-2 border-line">
                {history.rows.map((row) => (
                  <li
                    key={row.recordId}
                    className="relative flex flex-col py-1 pl-3 sm:flex-row sm:gap-2"
                  >
                    <span
                      aria-hidden
                      className={`absolute top-2.5 -left-[5px] size-2 rounded-full ${row.endDate === null ? 'bg-text' : 'bg-line-bright'}`}
                    />
                    {row.allianceId === null ? (
                      <span className="text-text-dim">{t('publicInfo.noAlliance')}</span>
                    ) : (
                      <AllianceLink id={row.allianceId} className="text-left">
                        {history.names.get(row.allianceId) ?? `#${row.allianceId}`}
                      </AllianceLink>
                    )}
                    <span className="text-xs text-text-dim sm:text-sm">
                      {row.endDate === null
                        ? t('publicInfo.periodOngoing', { start: monthYear(row.startDate) })
                        : t('publicInfo.period', {
                            start: monthYear(row.startDate),
                            end: monthYear(row.endDate),
                          })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
