import { useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { PointTooltip } from '@/components/ui/PointTooltip';
import {
  RING_GAUGES,
  RING_GAUGE_RADIUS,
  RING_VIEW,
  arcPath,
  gaugeArc,
  type RingGauge,
} from '@/engine/fittings/ringLayout';
import { budgetValue } from './ringFormat';
import { useOverBudgetFlash } from '../useOverBudgetFlash';
import { fmt1 } from '../stats/fixedFormat';

const GAUGE_STYLE: Readonly<
  Record<RingGauge, { width: number; tone: 'accent' | 'dim'; dash?: string }>
> = {
  cpu: { width: 10, tone: 'accent' },
  powergrid: { width: 10, tone: 'accent', dash: '7 3' },
  calibration: { width: 6, tone: 'dim' },
  droneBandwidth: { width: 6, tone: 'dim' },
};

const TONE_STROKE = { accent: 'stroke-accent', dim: 'stroke-text-dim' } as const;

const GAUGE_HIT_WIDTH = 22;

function share(used: number | null, total: number | null): number {
  return used !== null && total !== null && total > 0 ? used / total : Number.NaN;
}

export interface Budget {
  label: string;
  used: number | null;
  total: number | null;
  valueKey: string;
  flash: ReturnType<typeof useOverBudgetFlash>;
}

function gaugeTooltip(t: ReturnType<typeof useTranslation>['t'], budget: Budget): string {
  const value = budgetValue(t, budget);
  if (value === null) return t('fittings.ring.gaugeLoading', { label: budget.label });
  const fraction = share(budget.used, budget.total);
  const percent = Number.isFinite(fraction) ? Math.round(fraction * 100) : 0;
  return budget.flash.overBudget
    ? t('fittings.ring.gaugeOver', {
        label: budget.label,
        value,
        percent,
        amount: fmt1(budget.flash.overage),
      })
    : t('fittings.ring.gauge', { label: budget.label, value, percent });
}

function svgPoint(event: PointerEvent<SVGGElement>): { x: number; y: number } | null {
  const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
  if (!box || box.width === 0 || box.height === 0) return null;
  return {
    x: ((event.clientX - box.left) / box.width) * RING_VIEW,
    y: ((event.clientY - box.top) / box.height) * RING_VIEW,
  };
}

export function RimGauge({
  gauge,
  budget,
  compact,
}: {
  gauge: RingGauge;
  budget: Budget;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const { from, to } = RING_GAUGES[gauge];
  const style = GAUGE_STYLE[gauge];
  const c = RING_VIEW / 2;
  const { filled, empty } = gaugeArc(from, to, share(budget.used, budget.total));
  const fillClass = budget.flash.overBudget ? 'stroke-danger' : TONE_STROKE[style.tone];
  const draw = (range: [number, number]) => arcPath(range[0], range[1], RING_GAUGE_RADIUS, c, c);
  const bands = (
    <>
      {empty && (
        <path
          d={draw(empty)}
          className="fill-none stroke-line"
          strokeWidth={style.width}
          strokeDasharray={style.dash}
        />
      )}
      {filled && (
        <path
          d={draw(filled)}
          className={`fill-none ${fillClass}`}
          strokeWidth={style.width}
          strokeDasharray={style.dash}
        />
      )}
    </>
  );
  if (compact) return <g data-gauge={gauge}>{bands}</g>;
  return (
    <>
      <g
        data-gauge={gauge}
        className="pointer-events-auto"
        onPointerMove={(event) => setHover(svgPoint(event))}
        onPointerLeave={() => setHover(null)}
      >
        <path
          d={arcPath(from, to, RING_GAUGE_RADIUS, c, c)}
          className="fill-none stroke-transparent"
          strokeWidth={GAUGE_HIT_WIDTH}
        />
        {bands}
      </g>
      <PointTooltip
        open={hover !== null}
        onClose={() => setHover(null)}
        anchor={
          <circle
            aria-hidden="true"
            r={1}
            cx={hover?.x ?? c}
            cy={hover?.y ?? c}
            className="pointer-events-none fill-transparent"
          />
        }
      >
        <ChartTooltipShell>{gaugeTooltip(t, budget)}</ChartTooltipShell>
      </PointTooltip>
    </>
  );
}

export function GaugeSwatch({ gauge }: { gauge: RingGauge }) {
  const style = GAUGE_STYLE[gauge];
  return (
    <svg viewBox="0 0 20 10" className="h-2.5 w-5 shrink-0" aria-hidden="true">
      <line
        x1={0}
        y1={5}
        x2={20}
        y2={5}
        className={TONE_STROKE[style.tone]}
        strokeWidth={style.width / 2}
        strokeDasharray={style.dash ? '4 2' : undefined}
      />
    </svg>
  );
}
