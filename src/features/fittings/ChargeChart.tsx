import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  chargeScore,
  iskPerMinute,
  strictlyWorseThan,
  type ChargeChoice,
} from '@/engine/fittings/chargeChoice';

const W = 296;
const H = 250;
const PAD = { left: 34, right: 10, top: 24, bottom: 30 };
/** Faction versions sit straight above their Tech I charge; a nudge keeps equal ones apart. */
const NUDGE = 4;

function niceStep(max: number): number {
  if (max <= 200) return 50;
  if (max <= 500) return 100;
  if (max <= 1200) return 200;
  return 500;
}

/**
 * Range against damage: one mark per charge, told apart by shape (DESIGN.md
 * §1: by form, not a new colour) — Tech I hollow circle, faction filled
 * square, Tech II hollow triangle. The dashed line joins the charges nothing
 * else beats at their range. A mark selects; the box under the chart loads.
 */
export function ChargeChart({
  choices,
  distance,
  loaded,
  onLoad,
  gunCount,
}: {
  choices: ChargeChoice[];
  distance: number | null;
  loaded: ReadonlySet<number>;
  onLoad?: (chargeTypeId: number) => void;
  gunCount: number;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const score = (c: ChargeChoice) => chargeScore(c, distance);
  const maxKm = Math.max(10, ...choices.map((c) => c.optimal / 1000)) * 1.05;
  const top = Math.max(50, ...choices.map(score));
  const step = niceStep(top);
  const maxY = Math.ceil(top / step) * step;
  const x = (metres: number) => PAD.left + (metres / 1000 / maxKm) * (W - PAD.left - PAD.right);
  const y = (dps: number) => H - PAD.bottom - (dps / maxY) * (H - PAD.top - PAD.bottom);

  // Within one type, spread its versions a little either side.
  const nudge = new Map<number, number>();
  const byBase = new Map<number, ChargeChoice[]>();
  for (const c of choices) byBase.set(c.baseTypeId, [...(byBase.get(c.baseTypeId) ?? []), c]);
  for (const list of byBase.values()) {
    list
      .filter((c) => c.tier === 'faction')
      .forEach((c, i) => nudge.set(c.typeId, (i % 2 === 0 ? -1 : 1) * NUDGE));
  }
  const cx_ = (c: ChargeChoice) => x(c.optimal) + (nudge.get(c.typeId) ?? 0);

  const front: ChargeChoice[] = [];
  let runMax = -1;
  for (const c of choices
    .filter((c) => !c.skillMissing)
    .sort((a, b) => b.optimal - a.optimal || score(b) - score(a))) {
    if (score(c) > runMax) {
      front.push(c);
      runMax = score(c);
    }
  }

  const selected =
    choices.find((c) => c.typeId === selectedId) ??
    choices.find((c) => loaded.has(c.typeId)) ??
    choices[0]!;
  const ticksY: number[] = [];
  for (let v = 0; v <= maxY; v += step) ticksY.push(v);
  const kmStep = maxKm > 60 ? 20 : maxKm > 25 ? 10 : 5;
  const ticksX: number[] = [];
  for (let v = 0; v <= maxKm; v += kmStep) ticksX.push(v);

  const onKey = (event: KeyboardEvent, typeId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedId(typeId);
    }
  };

  const mark = (c: ChargeChoice) => {
    const px = cx_(c);
    const py = y(score(c));
    const on = c.typeId === selected.typeId;
    if (c.tier === 'tech2') {
      return (
        <path
          d={`M${px} ${py - 5} L${px + 5} ${py + 4} L${px - 5} ${py + 4} Z`}
          className={cx('fill-none stroke-[1.5]', on ? 'stroke-accent' : 'stroke-text')}
        />
      );
    }
    if (c.tier === 'faction') {
      return (
        <rect
          x={px - 4}
          y={py - 4}
          width={8}
          height={8}
          className={cx('fill-accent-dim', on && 'stroke-accent stroke-2')}
        />
      );
    }
    return (
      <circle
        cx={px}
        cy={py}
        r={4}
        className={cx('fill-panel', on ? 'stroke-accent stroke-2' : 'stroke-text-dim stroke-[1.5]')}
      />
    );
  };

  const isLoaded = loaded.has(selected.typeId);
  const worse = strictlyWorseThan(selected, choices);
  const perMin = iskPerMinute(selected);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('fittings.chargePicker.chartLabel')}
        className="block h-auto w-full text-[11px]"
      >
        {ticksY.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={PAD.left - 4} y={y(v) + 3} textAnchor="end" className="fill-text-dim">
              {v}
            </text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text
            key={`x${v}`}
            x={x(v * 1000)}
            y={H - PAD.bottom + 12}
            textAnchor="middle"
            className="fill-text-dim"
          >
            {v}
          </text>
        ))}
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-text-dim">
          {t('fittings.chargePicker.axisRange')}
        </text>
        <text x={4} y={PAD.top - 10} className="fill-text-dim">
          {t(
            distance === null ? 'fittings.chargePicker.dpsUnit' : 'fittings.chargePicker.dpsHitUnit'
          )}
        </text>
        {distance !== null && distance / 1000 <= maxKm && (
          <g>
            <line
              x1={x(distance)}
              x2={x(distance)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              strokeDasharray="3 3"
              className="stroke-warning"
            />
            <text x={x(distance) + 3} y={PAD.top + 8} className="fill-warning">
              {t('fittings.chargePicker.km', { km: Math.round(distance / 1000) })}
            </text>
          </g>
        )}
        {front.length > 1 && (
          <polyline
            points={front.map((c) => `${cx_(c)},${y(score(c))}`).join(' ')}
            strokeDasharray="4 3"
            className="fill-none stroke-success stroke-[1.25]"
          />
        )}
        {choices.map((c) => (
          <g
            key={c.typeId}
            role="button"
            tabIndex={0}
            aria-label={t('fittings.chargePicker.chartMark', {
              name: c.name,
              dps: Math.round(score(c)),
              km: Math.round(c.optimal / 1000),
            })}
            aria-pressed={c.typeId === selected.typeId}
            onClick={() => setSelectedId(c.typeId)}
            onKeyDown={(event) => onKey(event, c.typeId)}
            className="cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-accent"
          >
            <circle cx={cx_(c)} cy={y(score(c))} r={8} className="fill-transparent" />
            {mark(c)}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-text-dim">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" className="fill-panel stroke-text-dim stroke-[1.5]" />
          </svg>
          {t('fittings.chargePicker.tech1')}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <svg width="10" height="10" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" className="fill-accent-dim" />
          </svg>
          {t('fittings.chargePicker.faction')}
        </span>
        {choices.some((c) => c.tier === 'tech2') && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <svg width="10" height="10" aria-hidden="true">
              <path d="M5 1 L9 9 L1 9 Z" className="fill-none stroke-text stroke-[1.5]" />
            </svg>
            {t('fittings.chargePicker.tech2')}
          </span>
        )}
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <svg width="14" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="14" y2="5" strokeDasharray="4 3" className="stroke-success" />
          </svg>
          {t('fittings.chargePicker.legendBest')}
        </span>
      </div>
      <div className="space-y-1 bg-panel-2 p-2 text-[0.6875rem]">
        <div className="text-xs font-semibold">{selected.name}</div>
        <div className="flex justify-between gap-2 text-text-dim tabular-nums">
          <span>
            {t(distance === null ? 'fittings.chargePicker.dps' : 'fittings.chargePicker.dpsHit', {
              value: Math.round(score(selected)),
            })}{' '}
            ·{' '}
            {selected.falloff > 0
              ? t('fittings.chargePicker.range', {
                  optimal: Math.round(selected.optimal / 1000),
                  falloff: Math.round(selected.falloff / 1000),
                })
              : t('fittings.chargePicker.rangeMissile', {
                  optimal: Math.round(selected.optimal / 1000),
                })}
          </span>
          <span>
            {selected.price === null
              ? t('fittings.chargePicker.noPrice')
              : t('fittings.chargePicker.isk', {
                  isk: Math.round(selected.price).toLocaleString('en-US'),
                })}
            {perMin !== null &&
              ` · ${t('fittings.chargePicker.perMinute', { isk: formatCompactNumber(perMin) })}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-text-dim">
          <span>
            {selected.skillMissing
              ? t('fittings.chargePicker.needsSkill')
              : worse
                ? t('fittings.chargePicker.worseThan', {
                    name: worse.tier === 'faction' ? worse.faction : worse.name,
                  })
                : t('fittings.chargePicker.perMinuteHint', { count: gunCount })}
          </span>
          <Button
            size="sm"
            disabled={!onLoad || isLoaded || selected.skillMissing}
            onClick={() => onLoad?.(selected.typeId)}
          >
            {isLoaded
              ? t('fittings.chargePicker.loadedButton')
              : t('fittings.chargePicker.loadButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
