/**
 * "Where they kill" on a pilot's profile (Pilot Lookup and Show Info's
 * Character tab): kills in the last 30 days by kind of space and how long ago
 * the latest was, six months of kills by space, the hulls they flew and the
 * hulls they killed, and their latest kills. Kills only: a loss says little
 * about how dangerous a pilot is. Numbers, never verdicts.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner, TypeIcon } from '@/components/ui';
import {
  ageTone,
  KILL_SPACES,
  monthlyBySpace,
  summarizeKills,
  topShips,
  type KillRecord,
  type KillSpace,
} from '@/engine/pilotList/killActivity';
import { resolveStanding } from '@/engine/pilotList/standing';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemInfoLink } from '@/features/entities';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/useNow';
import { fetchPilotKillHistory } from '@/lib/zkillboard';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadViewerContext, type ViewerContext } from './pilotListData';

const SPACE_TEXT: Record<KillSpace, string> = {
  highsec: 'text-success',
  lowsec: 'text-warning',
  nullsec: 'text-danger',
  wormhole: 'text-accent',
};

const SPACE_BAR: Record<KillSpace, string> = {
  highsec: 'bg-success',
  lowsec: 'bg-warning',
  nullsec: 'bg-danger',
  wormhole: 'bg-accent',
};

const STANDING_TEXT = {
  red: 'text-danger',
  orange: 'text-warning',
  neutral: 'text-text-dim',
  blue: 'text-accent',
} as const;

/** Hulls listed under each of "Flew on their kills" and "Ships they killed". */
const HULLS_SHOWN = 4;
/** Latest kills listed. */
const LATEST_SHOWN = 3;

type HistoryState =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; kills: KillRecord[] };

export function PilotKillActivity({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [hullNames, setHullNames] = useState<Map<number, string>>(new Map());
  const [systemNames, setSystemNames] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void fetchPilotKillHistory(characterId).then((result) => {
      if (!cancelled)
        setHistory(result.ok ? { kind: 'ready', kills: result.kills } : { kind: 'failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt]);

  const kills = history.kind === 'ready' ? history.kills : null;
  const now = useNow();
  const view = useMemo(() => {
    if (kills === null) return null;
    return {
      now,
      summary: summarizeKills(kills, now),
      months: monthlyBySpace(kills, now),
      flew: topShips(
        kills.map((kill) => kill.ownShipTypeId),
        HULLS_SHOWN
      ),
      killed: topShips(
        kills.map((kill) => kill.victimShipTypeId),
        HULLS_SHOWN
      ),
      latest: kills.slice(0, LATEST_SHOWN),
    };
  }, [kills, now]);

  const hullKey = view
    ? [
        ...view.flew.map((h) => h.shipTypeId),
        ...view.killed.map((h) => h.shipTypeId),
        ...view.latest.flatMap((k) => (k.victimShipTypeId === null ? [] : [k.victimShipTypeId])),
      ]
        .sort((a, b) => a - b)
        .join(',')
    : '';
  const systemKey = view
    ? view.latest.flatMap((k) => (k.systemId === null ? [] : [k.systemId])).join(',')
    : '';
  useEffect(() => {
    if (hullKey === '') return;
    let cancelled = false;
    void loadTypeNames(hullKey.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setHullNames(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hullKey]);
  useEffect(() => {
    if (systemKey === '') return;
    let cancelled = false;
    void Promise.all(
      systemKey
        .split(',')
        .map(async (id) => [Number(id), (await lookupSolarSystem(Number(id)))?.name] as const)
    )
      .then((pairs) => {
        if (cancelled) return;
        setSystemNames(
          new Map(pairs.flatMap(([id, name]) => (name === undefined ? [] : [[id, name] as const])))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [systemKey]);

  const heading = (
    <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
      {t('travel.pilot.activity.title')}
    </h3>
  );

  if (history.kind === 'loading') {
    return (
      <section className="space-y-2">
        {heading}
        <Spinner label={t('common.loading')} />
      </section>
    );
  }
  if (history.kind === 'failed' || view === null) {
    return (
      <section className="space-y-2">
        {heading}
        <p className="flex flex-wrap items-center gap-3 text-sm text-text-dim">
          {t('travel.pilot.activity.failed')}
          <Button
            size="sm"
            onClick={() => {
              setHistory({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('travel.pilot.retry')}
          </Button>
        </p>
      </section>
    );
  }
  if (history.kills.length === 0) {
    return (
      <section className="space-y-2">
        {heading}
        <p className="text-sm text-text-dim">{t('travel.pilot.activity.empty')}</p>
      </section>
    );
  }

  const { summary, months } = view;
  const spaces = KILL_SPACES.filter(
    (space) => space !== 'wormhole' || summary.bySpace.wormhole.lastMs !== null
  );
  const tallest = Math.max(1, ...months.map((m) => KILL_SPACES.reduce((n, s) => n + m[s], 0)));
  const hull = (id: number) => hullNames.get(id) ?? t('common.unknownType', { id });

  return (
    <section className="space-y-3" aria-label={t('travel.pilot.activity.title')}>
      {heading}
      <ul
        className={cx(
          'grid gap-2',
          spaces.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        )}
      >
        {spaces.map((space) => {
          const { count, lastMs } = summary.bySpace[space];
          const tone = ageTone(lastMs, now);
          return (
            <li key={space} className="rounded-xs border border-line bg-panel-2 px-3 py-2">
              <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(`common.spaceOption.${space}`)}
              </span>
              <span
                className={cx(
                  'block text-lg font-semibold tabular-nums',
                  count > 0 ? SPACE_TEXT[space] : 'text-text-dim'
                )}
              >
                {count}
              </span>
              <span
                className={cx(
                  'block text-xs',
                  tone === 'fresh' ? 'font-semibold text-text' : 'text-text-dim',
                  (tone === 'old' || tone === 'none') && 'opacity-60'
                )}
              >
                {lastMs === null
                  ? t('travel.pilot.activity.none')
                  : t('travel.pilot.activity.last', { age: formatAge(now - lastMs, t) })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[0.6875rem] text-text-dim">{t('travel.pilot.activity.window')}</p>

      <div>
        <h4 className="mb-1 text-xs text-text-dim">{t('travel.pilot.activity.chart')}</h4>
        <div
          role="img"
          aria-label={t('travel.pilot.activity.chartLabel', {
            summary: months
              .map((m) => `${m.key}: ${KILL_SPACES.reduce((n, s) => n + m[s], 0)}`)
              .join(', '),
          })}
          className="grid h-24 grid-cols-6 items-end gap-1.5 border-b border-line"
        >
          {months.map((m) => (
            <div key={m.key} className="flex h-full min-w-0 flex-col-reverse">
              {KILL_SPACES.map((space) =>
                m[space] > 0 ? (
                  <span
                    key={space}
                    className={SPACE_BAR[space]}
                    style={{ height: `${(m[space] / tallest) * 100}%` }}
                  />
                ) : null
              )}
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="grid grid-cols-6 gap-1.5 pt-1 text-center text-[0.625rem] text-text-dim tabular-nums"
        >
          {months.map((m) => (
            <span key={m.key}>{m.key.slice(5)}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <HullList title={t('travel.pilot.activity.flew')} ships={view.flew} name={hull} />
        <HullList title={t('travel.pilot.activity.killed')} ships={view.killed} name={hull} />
      </div>
      <p className="text-[0.6875rem] text-text-dim">
        {t('travel.pilot.activity.basis', { count: history.kills.length })}
      </p>

      <div>
        <h4 className="mb-1 text-xs text-text-dim">{t('travel.pilot.activity.latest')}</h4>
        <ul className="divide-y divide-line text-sm">
          {view.latest.map((kill) => (
            <li
              key={`${kill.timeMs}-${kill.systemId ?? 0}-${kill.victimShipTypeId ?? 0}`}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-2 py-1"
            >
              <span className="text-xs text-text-dim tabular-nums">
                {formatAge(now - kill.timeMs, t)}
              </span>
              <span className="truncate">
                {kill.victimShipTypeId === null ? '—' : hull(kill.victimShipTypeId)}
              </span>
              <span className="text-xs text-text-dim">
                {kill.space !== null && (
                  <span className={cx('mr-1.5', SPACE_TEXT[kill.space])}>
                    {t(`common.spaceOption.${kill.space}`)}
                  </span>
                )}
                {kill.systemId === null ? '' : (systemNames.get(kill.systemId) ?? '')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HullList({
  title,
  ships,
  name,
}: {
  title: string;
  ships: { shipTypeId: number; count: number }[];
  name: (id: number) => string;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs text-text-dim">{title}</h4>
      {ships.length === 0 ? (
        <p className="text-sm text-text-dim">—</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {ships.map((ship) => (
            <li key={ship.shipTypeId} className="flex items-center gap-2">
              <TypeIcon
                typeId={ship.shipTypeId}
                size={32}
                width={20}
                height={20}
                className="rounded-xs border border-line"
              />
              <span className="min-w-0 flex-1 truncate">
                <ItemInfoLink typeId={ship.shipTypeId}>{name(ship.shipTypeId)}</ItemInfoLink>
              </span>
              <span className="text-xs text-text-dim tabular-nums">{ship.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where this pilot sits on the active Character's contact list (their own
 * contact, else their corporation's, else their alliance's), or that they are
 * in the Character's own corporation or alliance. Silent without a Character
 * or the contacts scope: no line is better than a wrong one.
 */
export function PilotStandingLine({
  characterId,
  corporationId,
  allianceId,
}: {
  characterId: number;
  corporationId: number;
  allianceId: number | null;
}) {
  const { t } = useTranslation();
  const activeId = useActiveCharacter((state) => state.activeCharacterId);
  const [viewer, setViewer] = useState<ViewerContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadViewerContext(activeId).then((loaded) => {
      if (!cancelled) setViewer(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (viewer === null || activeId === null) return null;
  const own =
    allianceId !== null && allianceId === viewer.allianceId
      ? 'alliance'
      : corporationId === viewer.corporationId
        ? 'corporation'
        : null;
  const standing = resolveStanding(viewer.contacts, { characterId, corporationId, allianceId });
  if (own === null && standing === null) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm">
      <span className="text-text-dim">{t('travel.pilot.list.standing')}</span>
      {own !== null && <span>{t(`travel.pilot.list.own.${own}`)}</span>}
      {standing !== null && (
        <span className={STANDING_TEXT[standing.band]}>
          {t(`travel.pilot.list.band.${standing.band}`)} {standing.value > 0 ? '+' : ''}
          {standing.value}
          <span className="ml-1.5 text-xs text-text-dim">
            {t(`travel.pilot.list.via.${standing.via}`)}
          </span>
        </span>
      )}
    </p>
  );
}
