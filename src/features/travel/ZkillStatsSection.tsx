/**
 * A pilot's or a corporation's zKillboard stats: the all-time figures, the
 * Snuggly↔Dangerous and Solo↔Gang meters, and the ships used most on kills.
 * Shared by Pilot Lookup / the Show Info Character tab (`PilotProfileView`)
 * and the Show Info Corporation tab, so the two read the same way. The two
 * meters quote zKillboard's own scales, ends and all (decision
 * `20261002-145207`); the app adds no reading of its own.
 *
 * zKillboard sends the same body for either kind of id (`parsePilotStats`);
 * only the no-history wording names which one it is.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, InfoTooltip, TypeIcon } from '@/components/ui';
import { loadTypeNames } from '@/features/character/typeNames';
import { formatIskCompact } from '@/lib/isk';
import type { PilotStatsResult, PilotTopShip } from '@/lib/zkillboard';

/** A 0-1 share as a percentage. */
function percent(value: number | null, digits = 0): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

export interface ZkillStatsSectionProps {
  stats: PilotStatsResult | null;
  subject: 'pilot' | 'corporation';
}

export function ZkillStatsSection({ stats, subject }: ZkillStatsSectionProps) {
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
      <EmptyState
        title={t('travel.pilot.noHistoryTitle')}
        hint={
          subject === 'corporation'
            ? t('travel.pilot.noHistoryHintCorporation')
            : t('travel.pilot.noHistoryHint')
        }
      />
    );
  }
  const s = stats.stats;
  const figures: { label: string; value: string; help?: string }[] = [
    { label: t('travel.pilot.kills'), value: s.kills.toLocaleString() },
    { label: t('travel.pilot.losses'), value: s.losses.toLocaleString() },
    { label: t('travel.pilot.iskDestroyed'), value: formatIskCompact(s.iskDestroyed) },
    { label: t('travel.pilot.iskLost'), value: formatIskCompact(s.iskLost) },
    {
      label: t('travel.pilot.iskEfficiency'),
      value: percent(s.iskEfficiency, 1),
      help: t('travel.pilot.iskEfficiencyHelp'),
    },
    { label: t('travel.pilot.soloKills'), value: s.soloKills.toLocaleString() },
  ];
  return (
    <section aria-label={t('travel.pilot.statsLabel')} className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {figures.map(({ label, value, help }) => (
          <div key={label} className="rounded-xs border border-line bg-panel-2 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {label}
              {help && (
                <InfoTooltip
                  label={t('common.aboutLabel', { label })}
                  content={help}
                  className="normal-case"
                />
              )}
            </dt>
            <dd className="text-base font-medium tabular-nums text-text">{value}</dd>
          </div>
        ))}
      </dl>
      {(s.dangerRatio !== null || s.gangRatio !== null) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.dangerRatio !== null && (
            <RatioMeter
              label={t('travel.pilot.dangerMeter')}
              help={t('travel.pilot.dangerMeterHelp')}
              low={t('travel.pilot.snuggly')}
              high={t('travel.pilot.dangerous')}
              value={s.dangerRatio}
              valueText={(v) =>
                v >= 50
                  ? t('travel.pilot.dangerousShare', { value: v })
                  : t('travel.pilot.snugglyShare', { value: 100 - v })
              }
            />
          )}
          {s.gangRatio !== null && (
            <RatioMeter
              label={t('travel.pilot.gangMeter')}
              help={t('travel.pilot.gangMeterHelp')}
              low={t('travel.pilot.solo')}
              high={t('travel.pilot.gang')}
              value={s.gangRatio}
              valueText={(v) =>
                v >= 50
                  ? t('travel.pilot.gangShare', { value: v })
                  : t('travel.pilot.soloShare', { value: 100 - v })
              }
            />
          )}
        </div>
      )}
      <p className="text-xs text-text-dim">{t('travel.pilot.statsSource')}</p>
      {s.topShips.length > 0 && <TopShips ships={s.topShips} />}
    </section>
  );
}

/**
 * One of zKillboard's 0-100 ratios as a two-ended meter. A single fill rather
 * than two coloured halves: the ends are named in text, and the readout names
 * the side the value leans to, so nothing rests on telling two colours apart.
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
    <div className="space-y-1.5 rounded-xs border border-line bg-panel-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {label}
          <InfoTooltip
            label={t('common.aboutLabel', { label })}
            content={help}
            className="normal-case"
          />
        </span>
        <span className="text-sm font-medium text-text tabular-nums">{text}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={text}
        className="relative h-2 overflow-hidden rounded-full border border-line bg-bg"
      >
        {/* `text-dim`, not accent: a reading, not a control (DESIGN.md §6). */}
        <div className="h-full rounded-full bg-text-dim" style={{ width: `${clamped}%` }} />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-line-bright" />
      </div>
      <div aria-hidden className="flex justify-between text-xs text-text-dim">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function TopShips({ ships }: { ships: PilotTopShip[] }) {
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
