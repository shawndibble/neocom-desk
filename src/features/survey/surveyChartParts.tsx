/**
 * Pieces the Survey tab's charts share: layout constants, the common time axis,
 * the standard value axis and the scan-node dot. Statically imports `recharts`,
 * so — same rule as `SurveyCharts.tsx` — this must only be reached through the
 * dynamic `import()` of `SurveyCharts` from `SurveyBoard.tsx`.
 */
import { scalePx } from '@/lib/fontScale';
import type { ReactElement } from 'react';
import { XAxis, YAxis } from 'recharts';
import { formatEveClock } from '@/engine/survey/chatMessage';
import { spacedLabels } from '@/engine/survey/labelSpacing';
import { timeTicks } from '@/engine/survey/timeTicks';
import type { SurveySummary } from '@/engine/survey/series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { SurveyScanNode } from './SurveyScanNode';

/** Left edge shared by the charts so their time axes line up. */
export const Y_AXIS_WIDTH = 52;
export const COMPACT_Y_AXIS_WIDTH = 36;
/** The Survey tab's volume chart height, px (Tailwind h-56). */
export const FULL_HEIGHT = 224;
export const MARGIN = { top: 16, right: 12, bottom: 0, left: 0 };

/** The shared time axis: its domain, ticks, and an `<XAxis>` factory (`hide` hides it). */
export function timeAxis(summary: SurveySummary): {
  domain: [number, number];
  ticks: number[];
  xAxis: (hide: boolean) => ReactElement;
} {
  // A hair past the finish so its marker is not clipped; the label sits left of the line.
  const end = summary.etaAt ?? summary.lastAt;
  const domain: [number, number] = [summary.firstAt, end + (end - summary.firstAt) * 0.01];
  const ticks = timeTicks(domain[0], domain[1]);
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="at"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      tickFormatter={formatEveClock}
      stroke="var(--color-line-bright)"
      tick={{ fill: 'var(--color-text-dim)', fontSize: '0.6875rem' }}
      hide={hide}
    />
  );
  return { domain, ticks, xAxis };
}

/** The standard value axis; `compact` narrows it, `label` adds an axis title. */
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

/** What Recharts hands a custom dot. */
interface NodeDotProps {
  cx?: number;
  cy?: number;
  payload?: { at?: number };
}

/** Builds the `dot` renderer drawing a SurveyScanNode on each scan; `onRemove` enables its menu. */
export function makeScanDot(onRemove?: (at: number) => void) {
  return function nodeDot({ cx, cy, payload }: NodeDotProps): ReactElement<SVGElement> {
    const at = payload?.at;
    if (typeof cx !== 'number' || typeof cy !== 'number' || at === undefined) {
      return <g key={`empty-${at ?? 'x'}`} />;
    }
    return (
      <g key={at}>
        <SurveyScanNode at={at} cx={cx} cy={cy} onRemove={onRemove} />
      </g>
    );
  };
}

/**
 * Which labels fit on a chart: the indexes of `labels` (at a time, with a
 * weight for who wins a clash) to draw, `gap` px apart at least. `plotWidth`
 * is the chart's reported width; before it reports one there is nothing to
 * measure, so all show.
 */
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

/**
 * A percent for display: whole numbers from 10 up, one decimal below, and "<0.1" for a positive
 * sliver that would round to 0 while its line still draws.
 */
export const formatPace = (v: number): string => {
  if (v >= 10) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return r === 0 && v > 0 ? '<0.1' : String(r);
};
