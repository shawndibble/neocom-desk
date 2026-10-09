/**
 * A pilot's, corporation's or alliance's zKillboard stats, in parts: stat
 * tiles, the Snuggly↔Dangerous and Solo↔Gang meters, and the ships used most
 * on kills. `ZkillStatsSection` assembles them for Pilot Lookup / the Show
 * Info Character tab (`PilotProfileView`); the Corporation and Alliance tabs
 * lay the same parts out around their own facts. The meters quote
 * zKillboard's own scales, ends and all (decision `20261002-145207`), and are
 * filled along a gray-to-red ramp by how far they reach (`20261009-092214`, which replaces
 * `20261002-163430`'s green-or-red-by-side).
 *
 * zKillboard sends the same body for either kind of id (`parsePilotStats`);
 * only the no-history wording names which one it is.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, InfoTooltip, IskAmount, TypeIcon } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import { loadTypeNames } from '@/features/character/typeNames';
import { ratioMeterColor } from '@/engine/pilotList/meterColor';
import { cx } from '@/lib/cx';
import type { PilotStats, PilotStatsResult, PilotTopShip } from '@/lib/zkillboard';
import { killerRatio, type StatTileItem } from './zkillFigures';

const NO_HISTORY_HINT = {
  pilot: 'travel.pilot.noHistoryHint',
  corporation: 'travel.pilot.noHistoryHintCorporation',
  alliance: 'travel.pilot.noHistoryHintAlliance',
} as const;

const termClassName =
  'flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

const TONE_CLASS = { positive: 'text-isk-pos', negative: 'text-isk-neg' } as const;

/**
 * One row of label/value tiles. `className` sets the columns; the default
 * puts every tile on one line from `md` up and wraps to three on a phone.
 */
export function StatTiles({ items, className }: { items: StatTileItem[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <dl className={cx('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {items.map(({ label, value, isk, help, tone }) => (
        <div key={label} className="min-w-0 rounded-xs border border-line bg-panel-2 px-3 py-2">
          <dt className={termClassName}>
            <span className="truncate">{label}</span>
            {help && (
              <InfoTooltip
                label={t('common.aboutLabel', { label })}
                content={help}
                className="normal-case"
              />
            )}
          </dt>
          <dd
            className={cx(
              'text-base font-medium tabular-nums',
              tone ? TONE_CLASS[tone] : 'text-text'
            )}
          >
            {isk === undefined ? value : <IskAmount value={isk} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What to show instead of the stats while they load, when zKillboard could
 * not be reached, or when it has no kill or loss for this id; null once the
 * stats are in.
 */
export function ZkillStatsStatus({
  stats,
  subject,
  onRetry,
}: {
  stats: PilotStatsResult | null;
  subject: 'pilot' | 'corporation' | 'alliance';
  /** Offered on a zKillboard failure; absent where the host has no way to reload. */
  onRetry?: () => void;
}): ReactNode {
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
        action={
          onRetry && (
            <Button size="sm" onClick={onRetry}>
              {t('travel.pilot.retry')}
            </Button>
          )
        }
      />
    );
  }
  if (stats.kind === 'no-history') {
    return (
      <EmptyState title={t('travel.pilot.noHistoryTitle')} hint={t(NO_HISTORY_HINT[subject])} />
    );
  }
  return null;
}

/**
 * The line under the figures: where they come from once they are in, or why
 * they are not — next to the "—" tiles it explains rather than at the foot of
 * the tab.
 */
export function ZkillStatsNote({
  stats,
  subject,
}: {
  stats: PilotStatsResult | null;
  subject: 'pilot' | 'corporation' | 'alliance';
}) {
  const { t } = useTranslation();
  if (stats?.kind === 'stats') {
    return <p className="text-xs text-text-dim">{t('travel.pilot.statsSource')}</p>;
  }
  return <ZkillStatsStatus stats={stats} subject={subject} />;
}

/**
 * The pilot's all-time figures as one line (kills, losses, ISK destroyed and
 * lost, solo kills) and where zKillboard states them from, or the reason there
 * are none yet. The meters and the hulls they fly are drawn by the profile
 * around it; the Corporation and Alliance tabs keep their tiles.
 */
export function ZkillStatsSection({
  stats,
  onRetry,
}: {
  stats: PilotStatsResult | null;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const status = <ZkillStatsStatus stats={stats} subject="pilot" onRetry={onRetry} />;
  if (stats === null || stats.kind !== 'stats') return status;
  const s = stats.stats;
  return (
    <section aria-label={t('travel.pilot.statsLabel')} className="space-y-1">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-text-dim tabular-nums">
        <span>
          <b className="font-semibold text-isk-pos">
            {t('travel.pilot.allTime.kills', { value: s.kills.toLocaleString() })}
          </b>
        </span>
        <span>
          <b className="font-semibold text-isk-neg">
            {t('travel.pilot.allTime.losses', { value: s.losses.toLocaleString() })}
          </b>
        </span>
        <span>
          <b className="font-semibold text-text">
            <IskAmount value={s.iskDestroyed} />
          </b>{' '}
          {t('travel.pilot.allTime.destroyed')}
        </span>
        <span>
          <b className="font-semibold text-text">
            <IskAmount value={s.iskLost} />
          </b>{' '}
          {t('travel.pilot.allTime.lost')}
        </span>
        <span>{t('travel.pilot.allTime.solo', { value: s.soloKills.toLocaleString() })}</span>
      </p>
      <ZkillStatsNote stats={stats} subject="pilot" />
    </section>
  );
}

/**
 * "How they fight": danger, fleet size, and kills against losses in one card.
 * Three narrow columns by default (a phone, the Corporation and Alliance
 * tabs), stacked as full-width rows when the pilot profile has room to put the
 * card beside the kill chart (`@3xl/profile`). Nothing when zKillboard sent no
 * ratio and there is no record.
 */
export function ZkillRatioMeters({ stats }: { stats: PilotStats }) {
  const { t } = useTranslation();
  const killer = killerRatio(stats);
  if (stats.dangerRatio === null && stats.gangRatio === null && killer === null) return null;
  return (
    <section
      aria-label={t('travel.pilot.fightTitle')}
      className="flex h-full flex-col gap-2.5 rounded-xs border border-line bg-panel px-3 py-2.5"
    >
      <h3 className={termClassName}>{t('travel.pilot.fightTitle')}</h3>
      <div className="grid flex-1 auto-cols-fr grid-flow-col gap-2.5 @3xl/profile:grid-flow-row @3xl/profile:content-around">
        {stats.dangerRatio !== null && (
          <RatioMeter
            label={t('travel.pilot.dangerMeter')}
            help={t('travel.pilot.dangerMeterHelp')}
            low={t('travel.pilot.snuggly')}
            high={t('travel.pilot.dangerous')}
            value={stats.dangerRatio}
            valueText={(v) => t('travel.pilot.dangerousShare', { value: v })}
          />
        )}
        {stats.gangRatio !== null && (
          <RatioMeter
            label={t('travel.pilot.gangMeter')}
            help={t('travel.pilot.gangMeterHelp')}
            low={t('travel.pilot.solo')}
            high={t('travel.pilot.gang')}
            value={stats.gangRatio}
            valueText={(v) =>
              v > 50
                ? t('travel.pilot.gangShare', { value: v })
                : v < 50
                  ? t('travel.pilot.soloShare', { value: 100 - v })
                  : t('travel.pilot.evenShare')
            }
          />
        )}
        {killer !== null && (
          <RatioMeter
            label={t('travel.pilot.killerMeter')}
            help={t('travel.pilot.killerMeterHelp')}
            low={t('travel.pilot.victim')}
            high={t('travel.pilot.killer')}
            value={killer}
            valueText={(v) =>
              v > 50
                ? t('travel.pilot.killerShare', { value: v })
                : v < 50
                  ? t('travel.pilot.victimShare', { value: 100 - v })
                  : t('travel.pilot.evenShare')
            }
          />
        )}
      </div>
    </section>
  );
}

/**
 * One of zKillboard's 0-100 ratios as a two-ended meter. The fill takes its
 * colour from how far along the scale it reaches (`ratioMeterColor`: gray,
 * blue, green, then warm only past half, never the verdict's red); the readout
 * stays plain text and names the end the value leans to in words, so nothing
 * rests on the colour.
 */
function RatioMeter({
  label,
  help,
  low,
  high,
  value,
  valueText,
}: {
  label: string;
  help: string;
  low: string;
  high: string;
  /** zKillboard's own 0-100 figure, towards `high`. */
  value: number;
  valueText: (rounded: number) => string;
}) {
  const { t } = useTranslation();
  const clamped = Math.min(100, Math.max(0, value));
  const rounded = Math.round(clamped);
  const text = valueText(rounded);
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-col gap-0.5 @3xl/profile:flex-row @3xl/profile:items-baseline @3xl/profile:justify-between @3xl/profile:gap-x-2">
        <span className={termClassName}>
          {label}
          <InfoTooltip
            label={t('common.aboutLabel', { label })}
            content={help}
            className="normal-case"
          />
        </span>
        <span className="text-base font-semibold text-text tabular-nums @3xl/profile:text-sm">
          {text}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={text}
        className="relative h-1.5 bg-panel-2"
      >
        <div
          className="h-full"
          style={{ width: `${clamped}%`, backgroundColor: ratioMeterColor(clamped) }}
        />
        <span aria-hidden className="absolute -inset-y-0.5 left-1/2 w-px bg-line-bright" />
      </div>
      <div
        aria-hidden
        className="flex flex-wrap justify-between gap-x-1 text-[0.6875rem] text-text-dim"
      >
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/**
 * The hulls flown most on kills, ranked: icon, name, and a bar sized against
 * the top hull so the spread reads at a glance, the count at the right.
 */
export function ZkillTopShips({ ships }: { ships: PilotTopShip[] }) {
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
  const most = Math.max(1, ...ships.map((ship) => ship.kills));
  return (
    <section className="space-y-2" aria-label={t('travel.pilot.topShips')}>
      <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.topShips')}
      </h3>
      <ol className="space-y-2">
        {ships.map((ship, rank) => (
          <li
            key={ship.shipTypeId}
            className="grid grid-cols-[1rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2.5"
          >
            <span className="text-right text-xs text-text-dim tabular-nums">{rank + 1}</span>
            <TypeIcon
              typeId={ship.shipTypeId}
              size={64}
              width={32}
              height={32}
              className="rounded-xs border border-line"
            />
            <span className="min-w-0 space-y-1">
              <span className="block truncate text-sm text-text">
                <ItemInfoLink typeId={ship.shipTypeId}>
                  {names.get(ship.shipTypeId) ?? t('common.unknownType', { id: ship.shipTypeId })}
                </ItemInfoLink>
              </span>
              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-bg">
                <span
                  className="block h-full rounded-full bg-text-dim"
                  style={{ width: `${(ship.kills / most) * 100}%` }}
                />
              </span>
            </span>
            <span className="text-sm font-medium text-text tabular-nums">
              {t('travel.pilot.shipKills', {
                count: ship.kills,
                formatted: ship.kills.toLocaleString(),
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
