/**
 * The info modal's cards for an NPC faction, corporation or agent, one per
 * view model in `npcInfoModel.ts`. They only lay text out: every choice (which
 * rows, which sentence) was made by the builder. Each card hugs its content
 * (`w-fit max-w-full`); `NpcInfoView` puts them in two columns from `md`.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eyebrow, StandingIcon } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { CharacterLink, CorporationLink, PlaceLink } from '@/features/entities';
import { JumpsLink } from '@/features/route/JumpsLink';
import { cx } from '@/lib/cx';
import { fixed1, fixed2 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import type { KnownRows } from './npcInfoLoaders';
import type {
  AccessModel,
  LoyaltyModel,
  StandingModel,
  StationFeeRow,
  StationsModel,
  WhereRow,
} from './npcInfoModel';

function Card({
  title,
  children,
  fill = false,
}: {
  title: string;
  children: ReactNode;
  /** Take the full row instead of hugging the content (the one-line fee rows need the room). */
  fill?: boolean;
}) {
  return (
    <section
      className={cx(
        'flex flex-col gap-2 rounded-xs border border-line bg-panel-2 p-3',
        fill ? 'w-full' : 'w-fit max-w-full'
      )}
    >
      <Eyebrow as="h3">{title}</Eyebrow>
      {children}
    </section>
  );
}

const Note = ({ children }: { children: ReactNode }) => (
  <p className="text-[0.6875rem] text-text-dim">{children}</p>
);

/** "6 jumps", a link to Route Safety with the route set. */
function Jumps({
  systemId,
  stationId,
  count,
}: {
  systemId: number;
  stationId?: number;
  count: number;
}) {
  const { t } = useTranslation();
  return (
    <JumpsLink systemId={systemId} stationId={stationId}>
      {t('publicInfo.npc.jumps', { count })}
    </JumpsLink>
  );
}

/** Faction, corporation, agent: your standing with each, the number first so it reads with its name. */
export function StandingBlock({ model }: { model: StandingModel }) {
  const { t } = useTranslation();
  const { note } = model;
  return (
    <Card title={t('publicInfo.npc.standing.title')}>
      <ol className="flex w-fit max-w-full flex-col gap-1.5">
        {model.rows.map(({ link, name, highest }) => {
          const number = (
            <span
              className={cx(
                'inline-block w-10 text-right tabular-nums',
                highest && 'font-semibold'
              )}
            >
              {fixed2(link.effective)}
            </span>
          );
          return (
            <li key={link.kind} className="flex items-center gap-2">
              <StandingIcon value={link.effective} />
              {model.skillsKnown ? (
                <HintText
                  content={t('publicInfo.npc.standing.baseAndSkills', {
                    base: fixed2(link.base),
                    effective: fixed2(link.effective),
                  })}
                >
                  {number}
                </HintText>
              ) : (
                number
              )}
              <span className={cx('min-w-0 truncate', highest && 'font-semibold')}>{name}</span>
              <span className="text-xs text-text-dim">{t(`publicInfo.npc.kind.${link.kind}`)}</span>
            </li>
          );
        })}
      </ol>
      {note?.kind === 'highest' && (
        <Note>{t('publicInfo.npc.standing.highest', { name: note.name })}</Note>
      )}
      {note?.kind === 'blocked' && (
        <Note>
          {t('publicInfo.npc.standing.blocked', {
            name: note.name,
            standing: fixed2(note.effective),
          })}
        </Note>
      )}
    </Card>
  );
}

/** The five agent levels as pips, with the standing each needs underneath. */
export function AccessBlock({ model }: { model: AccessModel }) {
  const { t } = useTranslation();
  const { verdict } = model;
  let sentence: string;
  switch (verdict.kind) {
    case 'all':
      sentence = t('publicInfo.npc.access.all');
      break;
    case 'blocked':
      sentence = t('publicInfo.npc.access.blocked');
      break;
    case 'next':
      sentence = t('publicInfo.npc.access.next', {
        level: verdict.level,
        needs: fixed2(verdict.needs),
        short: fixed2(verdict.short),
      });
      break;
    case 'agent':
      if (verdict.blockedBy) {
        sentence = t('publicInfo.npc.access.agentBlocked', {
          name: verdict.blockedBy.name,
          standing: fixed2(verdict.blockedBy.effective),
        });
      } else if (verdict.needs === null) {
        sentence = t('publicInfo.npc.access.agentFree');
      } else {
        sentence = t(
          verdict.open ? 'publicInfo.npc.access.agentYes' : 'publicInfo.npc.access.agentNo',
          {
            level: verdict.level,
            needs: fixed2(verdict.needs),
            have: fixed2(verdict.have),
          }
        );
      }
      break;
  }
  return (
    <Card
      title={t(
        verdict.kind === 'agent'
          ? 'publicInfo.npc.access.titleAgent'
          : 'publicInfo.npc.access.title'
      )}
    >
      <div className="flex w-fit gap-1.5">
        {model.segments.map(({ level, needs, open, own }) => (
          <div
            key={level}
            role="img"
            aria-label={
              needs === null
                ? t('publicInfo.npc.access.levelOneOpen')
                : t(
                    open ? 'publicInfo.npc.access.levelOpen' : 'publicInfo.npc.access.levelClosed',
                    {
                      level,
                      needs: fixed2(needs),
                    }
                  )
            }
            className="flex w-9 flex-col items-center gap-0.5"
          >
            <span
              aria-hidden="true"
              className={cx(
                'h-2 w-full',
                open ? 'bg-accent' : 'bg-line',
                own && 'outline-2 outline-offset-2 outline-accent'
              )}
            />
            <span aria-hidden="true" className="text-[0.6875rem] text-text-dim tabular-nums">
              {t('publicInfo.npc.access.levelShort', { level })}
            </span>
            <span aria-hidden="true" className="text-[0.6875rem] text-text-dim tabular-nums">
              {needs === null ? '—' : fixed2(needs)}
            </span>
          </div>
        ))}
      </div>
      <Note>{sentence}</Note>
    </Card>
  );
}

function FeeRow({ row }: { row: StationFeeRow }) {
  const { t } = useTranslation();
  const format = row.kind === 'broker' ? fixed2 : fixed1;
  const approx = row.kind === 'broker' ? '' : '~';
  const label =
    row.kind === 'broker'
      ? t('publicInfo.npc.stations.brokerFee', { place: row.place })
      : row.place === null
        ? t('publicInfo.npc.stations.reprocessing')
        : t('publicInfo.npc.stations.reprocessingAt', { place: row.place });
  const amount = `${approx}${format(Math.abs(row.savingPct))}%`;
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-text-dim">{label}</dt>
      <dd className="ml-auto tabular-nums">
        {row.savingPct !== 0 && (
          <>
            <s className="text-text-dim">{format(row.atZeroPct)}%</s>{' '}
          </>
        )}
        {approx}
        {format(row.atYoursPct)}%
        {row.savingPct > 0 && (
          <span className="text-success"> {t('publicInfo.npc.stations.saves', { amount })}</span>
        )}
        {row.savingPct < 0 && (
          <span className="text-danger"> {t('publicInfo.npc.stations.costs', { amount })}</span>
        )}
      </dd>
    </div>
  );
}

/** Broker fee and reprocessing tax at their stations: each on one line, never wrapped. */
export function StationsBlock({ model }: { model: StationsModel }) {
  const { t } = useTranslation();
  return (
    <Card title={t('publicInfo.npc.stations.title')} fill>
      <dl className="flex flex-col gap-1 overflow-x-auto whitespace-nowrap">
        {model.rows.map((row) => (
          <FeeRow key={`${row.kind}-${row.place}`} row={row} />
        ))}
      </dl>
      {model.brokerRelationsLevel !== null && (
        <Note>{t('publicInfo.npc.stations.note', { level: model.brokerRelationsLevel })}</Note>
      )}
    </Card>
  );
}

function WhereValue({ row }: { row: WhereRow }) {
  const { t } = useTranslation();
  switch (row.kind) {
    case 'headquarters':
      return <PlaceLink id={row.stationId}>{row.name}</PlaceLink>;
    case 'capital':
      return (
        <>
          {row.name ?? `#${row.systemId}`}
          {row.jumps !== null && (
            <>
              {' · '}
              <Jumps systemId={row.systemId} count={row.jumps} />
            </>
          )}
        </>
      );
    case 'stations':
      return (
        <>
          {t('publicInfo.npc.where.stationsValue', { stations: row.stations, count: row.systems })}
        </>
      );
    case 'militia':
      return (
        <CorporationLink id={row.corporationId}>
          {row.name ?? `#${row.corporationId}`}
        </CorporationLink>
      );
    case 'nearest':
    case 'station':
      return (
        <>
          <PlaceLink id={row.stationId}>{row.name}</PlaceLink>
          {row.jumps !== null && (
            <>
              {' · '}
              <Jumps systemId={row.systemId} stationId={row.stationId} count={row.jumps} />
            </>
          )}
        </>
      );
    case 'agent':
      return (
        <>
          {row.divisionName === undefined
            ? t('publicInfo.npc.where.agentValueNoDivision', { level: row.level })
            : t('publicInfo.npc.where.agentValue', {
                level: row.level,
                division: row.divisionName,
              })}
        </>
      );
  }
}

export function WhereBlock({ rows }: { rows: readonly WhereRow[] }) {
  const { t } = useTranslation();
  return (
    <Card title={t('publicInfo.npc.where.title')}>
      <dl className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.kind} className="flex gap-3">
            <dt className="w-24 shrink-0 text-text-dim">{t(`publicInfo.npc.where.${row.kind}`)}</dt>
            <dd className="min-w-0">
              <WhereValue row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Agents (of a corporation) or corporations (of a faction) the pilot already has a standing with. */
export function KnownBlock({ known }: { known: KnownRows }) {
  const { t } = useTranslation();
  return (
    <Card
      title={t(
        known.kind === 'agents'
          ? 'publicInfo.npc.known.agents'
          : 'publicInfo.npc.known.corporations'
      )}
    >
      <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {known.kind === 'corporations'
          ? known.rows.map((row) => (
              <li key={row.corporationId} className="flex items-center gap-2">
                <StandingIcon value={row.effective} />
                <span className="w-10 text-right tabular-nums">{fixed2(row.effective)}</span>
                <CorporationLink id={row.corporationId} className="min-w-0 truncate">
                  {row.name}
                </CorporationLink>
              </li>
            ))
          : known.rows.map((row) => (
              <li key={row.agentId} className="flex items-center gap-2">
                <StandingIcon value={row.effective} />
                <span className="w-10 text-right tabular-nums">{fixed2(row.effective)}</span>
                <CharacterLink id={row.agentId} className="min-w-0 truncate">
                  {row.name}
                </CharacterLink>
                <span className="text-xs whitespace-nowrap text-text-dim">
                  {row.divisionName === undefined
                    ? t('publicInfo.npc.known.agentLevelNoDivision', { level: row.level })
                    : t('publicInfo.npc.known.agentLevel', {
                        level: row.level,
                        division: row.divisionName,
                      })}
                </span>
                {row.place?.jumps != null && (
                  <span className="whitespace-nowrap">
                    <Jumps systemId={row.place.systemId} count={row.place.jumps} />
                  </span>
                )}
              </li>
            ))}
      </ul>
    </Card>
  );
}

export function LoyaltyLine({
  corporationId,
  model,
}: {
  corporationId: number;
  model: LoyaltyModel;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-dim">{t('publicInfo.npc.loyalty.title')}</span>
      <span className="tabular-nums">
        {model.balance === 0 ? t('publicInfo.npc.loyalty.none') : formatCount(model.balance)}
      </span>
      {model.hasStore && (
        <Link to={`/wallet/lp-store/${corporationId}`} className={entityLinkClassName('ml-auto')}>
          {t('publicInfo.npc.loyalty.openStore')}
        </Link>
      )}
    </div>
  );
}
