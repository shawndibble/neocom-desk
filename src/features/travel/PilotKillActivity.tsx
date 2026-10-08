/**
 * "Where they kill" on a pilot's profile (Pilot Lookup and Show Info's
 * Character tab): kills in the last 30 days by kind of space and how long ago
 * the latest was, six months of kills by space, and the hulls they killed.
 * The hulls they fly and their latest kills are the sections below it. Kills
 * only: a loss says little about how dangerous a pilot is. The profile's Threat
 * verdict (`PilotThreatSummary`) is read from the same kills.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, Spinner, TypeIcon } from '@/components/ui';
import {
  ageTone,
  KILL_SPACES,
  monthlyBySpace,
  summarizeKills,
  topShips,
} from '@/engine/pilotList/killActivity';
import { resolveStanding } from '@/engine/pilotList/standing';
import { loadTypeNames } from '@/features/character/typeNames';
import { ItemInfoLink } from '@/features/entities';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { useNow } from '@/lib/useNow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadViewerContext, type ViewerContext } from './pilotListData';
import { PilotStandingTag } from './PilotStandingTag';
import { SPACE_BAR, SPACE_TEXT } from './pilotListStyles';
import { usePilotKillHistory, type PilotKillHistoryState } from './usePilotKillHistory';

/** Hulls listed under "Ships they killed". Their own hulls and latest kills are already on this profile. */
const HULLS_SHOWN = 5;

/** `2026-05` -> "May", read in UTC like the buckets. */
function monthName(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** The loading, failed and ready states share one fetch: `PilotProfileView` owns it and hands it down. */
export function PilotKillActivity({ characterId }: { characterId: number }) {
  const { history, retry } = usePilotKillHistory(characterId);
  return <PilotKillActivityView history={history} onRetry={retry} />;
}

export function PilotKillActivityView({
  history,
  onRetry,
}: {
  history: PilotKillHistoryState;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [hullNames, setHullNames] = useState<Map<number, string>>(new Map());
  const [chartOpen, setChartOpen] = useState(false);

  const kills = history.kind === 'ready' ? history.kills : null;
  const now = useNow();
  const view = useMemo(() => {
    if (kills === null) return null;
    return {
      summary: summarizeKills(kills, now),
      months: monthlyBySpace(kills, now),
      killed: topShips(
        kills.map((kill) => kill.victimShipTypeId),
        HULLS_SHOWN
      ),
    };
  }, [kills, now]);

  const hullKey = view
    ? view.killed
        .map((h) => h.shipTypeId)
        .sort((a, b) => a - b)
        .join(',')
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
          <Button size="sm" onClick={onRetry}>
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
  const monthTotal = (m: (typeof months)[number]) => KILL_SPACES.reduce((n, sp) => n + m[sp], 0);
  const chartSpaces = KILL_SPACES.filter((space) => months.some((m) => m[space] > 0));
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

      <Disclosure
        label={t('travel.pilot.activity.chart')}
        expanded={chartOpen}
        onToggle={() => setChartOpen((open) => !open)}
        className="rounded-xs border border-line"
      >
        <div className="p-3">
          <div
            role="img"
            aria-label={t('travel.pilot.activity.chartLabel', {
              summary: months.map((m) => `${monthName(m.key)}: ${monthTotal(m)}`).join(', '),
            })}
            className="space-y-1"
          >
            <div
              aria-hidden
              className="grid grid-cols-6 gap-1.5 text-center text-[0.6875rem] text-text-dim tabular-nums"
            >
              {months.map((m) => (
                <span key={m.key} className={monthTotal(m) > 0 ? 'text-text' : undefined}>
                  {monthTotal(m)}
                </span>
              ))}
            </div>
            <div
              aria-hidden
              className="grid h-20 grid-cols-6 items-end gap-1.5 border-b border-line"
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
              className="grid grid-cols-6 gap-1.5 text-center text-[0.6875rem] text-text-dim"
            >
              {months.map((m) => (
                <span key={m.key}>{monthName(m.key)}</span>
              ))}
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
            {chartSpaces.map((space) => (
              <li key={space} className="flex items-center gap-1.5">
                <span aria-hidden className={cx('size-2.5', SPACE_BAR[space])} />
                {t(`common.spaceOption.${space}`)}
              </li>
            ))}
          </ul>
        </div>
      </Disclosure>

      <HullList title={t('travel.pilot.activity.killed')} ships={view.killed} name={hull} />
      <p className="text-[0.6875rem] text-text-dim">
        {t('travel.pilot.activity.basis', { count: history.kills.length })}
      </p>
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
        <span className="inline-flex items-center gap-1.5">
          <PilotStandingTag standing={standing} />
          {standing.via !== 'character' && (
            <span className="text-xs text-text-dim">
              {t(`travel.pilot.list.via.${standing.via}`)}
            </span>
          )}
        </span>
      )}
    </p>
  );
}
