import { DAY_MS } from '@/lib/age';
import { scalePx } from '@/lib/fontScale';
import type { ReactElement } from 'react';
import { ReferenceArea, XAxis, YAxis, type CartesianViewBox } from 'recharts';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import { realTime } from '@/engine/survey/gapAxis';
import { formatDateTick } from '@/lib/formatDateTick';
import { utcDay } from '@/engine/localDay';
import { spacedLabels } from '@/engine/survey/labelSpacing';
import { timeTicks } from '@/engine/survey/timeTicks';
import type { SurveySummary } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { SurveyScanNode } from './SurveyScanNode';

export const Y_AXIS_WIDTH = 52;
export const COMPACT_Y_AXIS_WIDTH = 36;
export const FULL_HEIGHT = 224;
export const MARGIN = { top: 16, right: 12, bottom: 0, left: 0 };

export function timeAxis(summary: SurveySummary): {
  domain: [number, number];
  ticks: number[];
  xAxis: (hide: boolean) => ReactElement;
} {
  const end = summary.etaAt ?? summary.lastAt;
  const domain: [number, number] = [summary.firstAt, end + (end - summary.firstAt) * 0.01];
  const { axis } = summary;
  const ticks = axis?.ticks ?? timeTicks(domain[0], domain[1]);
  const multiDay = !axis && domain[1] - domain[0] > DAY_MS;
  const showsDate = (x: number): boolean => {
    return axis ? axis.dateTicks.has(x) : multiDay && x % DAY_MS === 0;
  };
  const tick = ({
    x,
    y,
    payload,
  }: {
    x: number | string;
    y: number | string;
    payload: { value: number };
  }) => {
    const t = realTime(summary, payload.value);
    return (
      <g transform={`translate(${x},${y})`} fill="var(--color-text-dim)">
        <text textAnchor="middle" dy={12} fontSize="0.6875rem">
          {formatEveClock(t)}
        </text>
        {showsDate(payload.value) && (
          <text textAnchor="middle" dy={24} fontSize="0.6875rem">
            {formatDateTick(utcDay(t))}
          </text>
        )}
      </g>
    );
  };
  const height = ticks.some(showsDate) ? 40 : 30;
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="at"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      tickFormatter={(x: number) => formatEveClock(realTime(summary, x))}
      stroke="var(--color-line-bright)"
      tick={tick}
      height={height}
      hide={hide}
    />
  );
  return { domain, ticks, xAxis };
}

export const clock = (summary: SurveySummary, x: number): string =>
  formatEveClock(realTime(summary, x));

const BREAK_LABEL_WIDTH = 46;

const breakLabel =
  (text: string) =>
  ({ viewBox }: { viewBox?: object }) => {
    const { x = 0, y = 0, width = 0, height = 0 } = (viewBox ?? {}) as Partial<CartesianViewBox>;
    if (width < scalePx(BREAK_LABEL_WIDTH)) return null;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        fill="var(--color-text-dim)"
        fontSize="0.6875rem"
      >
        {text}
      </text>
    );
  };

export function gapBreaks(summary: SurveySummary, label: boolean): ReactElement[] {
  return (summary.axis?.breaks ?? []).map((b) => (
    <ReferenceArea
      key={b.from}
      x1={b.from}
      x2={b.to}
      fill="var(--color-line)"
      fillOpacity={0.6}
      stroke="var(--color-line-bright)"
      strokeDasharray="2 3"
      ifOverflow="visible"
      label={label ? { content: breakLabel(formatDuration(b.realTo - b.realFrom)) } : undefined}
    />
  ));
}

export function yAxis(
  opts: {
    compact?: boolean;
    label?: React.ComponentProps<typeof YAxis>['label'];
    domain?: React.ComponentProps<typeof YAxis>['domain'];
  } = {}
): ReactElement {
  return (
    <YAxis
      width={scalePx(opts.compact ? COMPACT_Y_AXIS_WIDTH : Y_AXIS_WIDTH)}
      tickFormatter={formatCompactNumber}
      stroke="var(--color-line-bright)"
      tick={{ fill: 'var(--color-text-dim)', fontSize: '0.6875rem' }}
      label={opts.label}
      domain={opts.domain}
    />
  );
}

interface NodeDotProps {
  cx?: number;
  cy?: number;
  payload?: { at?: number };
}

export function makeScanDot(
  onRemove?: (at: number) => void,
  toTime: (x: number) => number = (x) => x
) {
  return function nodeDot({ cx, cy, payload }: NodeDotProps): ReactElement<SVGElement> {
    const at = payload?.at;
    if (typeof cx !== 'number' || typeof cy !== 'number' || at === undefined) {
      return <g key={`empty-${at ?? 'x'}`} />;
    }
    return (
      <g key={at}>
        <SurveyScanNode at={toTime(at)} cx={cx} cy={cy} onRemove={onRemove} />
      </g>
    );
  };
}

export function thinLabels(
  labels: { at: number; weight: number }[],
  domain: [number, number] | readonly [number, number],
  plotWidth: number,
  gap: number
): Set<number> {
  const plotPx = Math.max(0, plotWidth - scalePx(Y_AXIS_WIDTH) - MARGIN.right);
  if (plotPx === 0) return new Set(labels.keys());
  return spacedLabels(
    labels.map((l) => ({
      x: ((l.at - domain[0]) / (domain[1] - domain[0])) * plotPx,
      weight: l.weight,
    })),
    gap
  );
}

export const formatPace = (v: number): string => {
  if (v >= 10) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return r === 0 && v > 0 ? '<0.1' : String(r);
};
