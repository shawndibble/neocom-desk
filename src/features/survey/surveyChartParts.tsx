/**
 * Pieces the Survey tab's charts share: layout constants, the common time axis,
 * the standard value axis and the scan-node dot. Statically imports `recharts`,
 * so — same rule as `SurveyCharts.tsx` — this must only be reached through the
 * dynamic `import()` of `SurveyCharts` from `SurveyBoard.tsx`.
 */
import { DAY_MS } from '@/lib/age';
import { scalePx } from '@/lib/fontScale';
import type { ReactElement } from 'react';
import { ReferenceArea, XAxis, YAxis, type CartesianViewBox } from 'recharts';
import { formatDuration, formatEveClock } from '@/engine/survey/chatMessage';
import { realTime } from '@/engine/survey/gapAxis';
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

const shortDate = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The shared time axis: its domain, ticks, and an `<XAxis>` factory (`hide` hides it). */
export function timeAxis(summary: SurveySummary): {
  domain: [number, number];
  ticks: number[];
  xAxis: (hide: boolean) => ReactElement;
} {
  // A hair past the finish so its marker is not clipped; the label sits left of the line.
  const end = summary.etaAt ?? summary.lastAt;
  const domain: [number, number] = [summary.firstAt, end + (end - summary.firstAt) * 0.01];
  const { axis } = summary;
  const ticks = axis?.ticks ?? timeTicks(domain[0], domain[1]);
  // Past a day the clock alone repeats ("00:00" twice), so a midnight tick names its date.
  const multiDay = !axis && domain[1] - domain[0] > DAY_MS;
  // A tick that starts a stretch of scans (or midnight, past a day) carries its date under the clock.
  const named = (x: number): boolean => {
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
    const t = axis ? axis.toTime(payload.value) : payload.value;
    return (
      <g transform={`translate(${x},${y})`} fill="var(--color-text-dim)">
        <text textAnchor="middle" dy={12} fontSize="0.6875rem">
          {formatEveClock(t)}
        </text>
        {named(payload.value) && (
          <text textAnchor="middle" dy={24} fontSize="0.6875rem">
            {shortDate(t)}
          </text>
        )}
      </g>
    );
  };
  const height = ticks.some(named) ? 40 : 30;
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="at"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      tickFormatter={(x: number) => formatEveClock(axis ? axis.toTime(x) : x)}
      stroke="var(--color-line-bright)"
      tick={tick}
      height={height}
      hide={hide}
    />
  );
  return { domain, ticks, xAxis };
}

/** A position on the chart's time axis as the EVE clock it stands for. */
export const clock = (summary: SurveySummary, x: number): string =>
  formatEveClock(realTime(summary, x));

/** Room the label text of a break needs, px at the base font: "23h 35m" at 11px. */
const BREAK_LABEL_WIDTH = 46;

/** The text in a break's band, left out when the band is too narrow to hold it (a phone). */
const breakLabel =
  (text: string) =>
  ({ viewBox }: { viewBox?: object }) => {
    // A ReferenceArea hands its label the area's rectangle.
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

/**
 * A shaded band over each squeezed gap, labelled with how long it was. Spread it
 * into a chart's children: Recharts reads its direct children only.
 */
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
export function makeScanDot(
  onRemove?: (at: number) => void,
  /** Maps a position on a squeezed axis to the scan's real time, which names the node and is what `onRemove` gets. */
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
