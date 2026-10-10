/**
 * "Where they kill" on a pilot's profile (Pilot Lookup and Show Info's
 * Character tab): kills in the last 30 days by kind of space and how long ago
 * the latest was, under six months of kills by space. The chart is always open
 * (it is the point of the section), and its card carries the counts. The
 * hulls they fly and kill (`PilotShips`) and their latest kills are the
 * sections below it. Kills only: a loss says little about how dangerous a
 * pilot is. The profile's Threat verdict (`PilotThreatBand`) is read from the
 * same kills.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@/components/ui';
import {
  ageTone,
  KILL_SPACES,
  monthlyBySpace,
  summarizeKills,
} from '@/engine/pilotList/killActivity';
import { resolveStanding } from '@/engine/pilotList/standing';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useNow } from '@/lib/useNow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadViewerContext, type ViewerContext } from './pilotListData';
import { PilotStandingTag } from './PilotStandingTag';
import { SPACE_BAR, SPACE_RULE, SPACE_TEXT } from './pilotListStyles';
import { usePilotKillHistory, type PilotKillHistoryState } from './usePilotKillHistory';

/** `2026-05` -> "May", read in UTC like the buckets. */
function monthName(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * The self-fetching form, for a caller with no other use for the kills.
 * `PilotProfileView` fetches once itself (the verdict reads the same kills)
 * and draws `PilotKillActivityView` directly.
 */
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

  const kills = history.kind === 'ready' ? history.kills : null;
  const now = useNow();
  const view = useMemo(() => {
    if (kills === null) return null;
    return {
      summary: summarizeKills(kills, now),
      months: monthlyBySpace(kills, now),
    };
  }, [kills, now]);

  const [resultRef, , holdFocus] = useRetryFocus<HTMLElement>(
    history.kind === 'loading'
      ? 'busy'
      : history.kind === 'failed' || view === null
        ? 'failed'
        : 'ok',
    null
  );

  const heading = (
    <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
      {t('travel.pilot.activity.title')}
    </h3>
  );

  if (history.kind === 'loading') {
    return (
      <section ref={resultRef} tabIndex={-1} className="space-y-2 outline-none">
        {heading}
        <Spinner label={t('common.loading')} />
      </section>
    );
  }
  if (history.kind === 'failed' || view === null) {
    return (
      <section ref={resultRef} tabIndex={-1} className="space-y-2 outline-none">
        {heading}
        <p className="flex flex-wrap items-center gap-3 text-sm text-text-dim">
          {t('travel.pilot.activity.failed')}
          <Button
            size="sm"
            onClick={() => {
              holdFocus();
              onRetry();
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
      <section ref={resultRef} tabIndex={-1} className="space-y-2 outline-none">
        {heading}
        <p className="text-sm text-text-dim">{t('travel.pilot.activity.empty')}</p>
      </section>
    );
  }

  const { summary, months } = view;
  const spaces = KILL_SPACES.filter(
    (space) => space !== 'wormhole' || summary.bySpace.wormhole.lastMs !== null
  );
  const monthTotal = (m: (typeof months)[number]) => KILL_SPACES.reduce((n, sp) => n + m[sp], 0);
  const tallest = Math.max(1, ...months.map(monthTotal));

  return (
    <section
      ref={resultRef}
      tabIndex={-1}
      aria-label={t('travel.pilot.activity.title')}
      className="@container/kills flex outline-none h-full flex-col gap-2.5 rounded-xs border border-line bg-panel px-3.5 py-3"
    >
      <div className="flex items-baseline justify-between gap-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        <h3>
          {t('travel.pilot.activity.chart')}
          <span className="hidden @sm/kills:inline">{t('travel.pilot.activity.chartBySpace')}</span>
        </h3>
        <span className="text-right whitespace-nowrap">
          {t('travel.pilot.activity.chartPeriod')}
        </span>
      </div>
      <div
        role="img"
        aria-label={t('travel.pilot.activity.chartLabel', {
          summary: months.map((m) => `${monthName(m.key)}: ${monthTotal(m)}`).join(', '),
        })}
        className="space-y-1"
      >
        <div
          aria-hidden
          className="grid grid-cols-6 gap-2 text-center text-xs text-text-dim tabular-nums"
        >
          {months.map((m) => (
            <span key={m.key} className={monthTotal(m) > 0 ? 'font-semibold text-text' : undefined}>
              {monthTotal(m)}
            </span>
          ))}
        </div>
        <div
          aria-hidden
          className="grid h-[5.625rem] grid-cols-6 items-end gap-2 border-b border-line-bright @sm/kills:h-28.5"
        >
          {months.map((m) => (
            <div
              key={m.key}
              className="mx-auto flex h-full w-full max-w-9 min-w-0 flex-col-reverse @sm/kills:max-w-14"
            >
              {monthTotal(m) === 0 && <span className="h-0.5 bg-line" />}
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
        <div aria-hidden className="grid grid-cols-6 gap-2 text-center text-xs text-text-dim">
          {months.map((m) => (
            <span key={m.key}>{monthName(m.key)}</span>
          ))}
        </div>
      </div>

      <h4 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.activity.last30')}
      </h4>
      <ul className={cx('grid gap-2', spaces.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {spaces.map((space) => {
          const { count, lastMs } = summary.bySpace[space];
          const tone = ageTone(lastMs, now);
          return (
            <li
              key={space}
              className={cx(
                'min-w-0 border-t-2 pt-1.5',
                count > 0 ? SPACE_RULE[space] : 'border-t-line'
              )}
            >
              <span className="block text-[0.625rem] font-semibold tracking-wider text-text-dim uppercase @sm/kills:text-[0.6875rem] @sm/kills:tracking-widest">
                {t(`common.spaceOption.${space}`)}
              </span>
              <span
                className={cx(
                  'block text-xl leading-tight font-semibold tabular-nums @sm/kills:text-2xl',
                  count > 0 ? SPACE_TEXT[space] : 'text-text-dim'
                )}
              >
                {count}
              </span>
              <span
                className={cx(
                  'block text-[0.6875rem] @sm/kills:text-xs',
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
    </section>
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
