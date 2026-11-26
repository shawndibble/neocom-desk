import { median } from '@/engine/math';
import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { SurveySummary } from './series';
import { timeTicks } from './timeTicks';

const GAP_MIN_MS = 2 * HOUR_MS;
const GAP_FACTOR = 3;
const BREAK_MIN_MS = 10 * MINUTE_MS;
const BREAK_SHARE = 0.08;

export interface AxisBreak {
  from: number;
  to: number;
  realFrom: number;
  realTo: number;
}

export interface GapAxis {
  breaks: AxisBreak[];
  ticks: number[];
  dateTicks: Set<number>;
  toTime: (x: number) => number;
}

export function compressGaps(summary: SurveySummary): SurveySummary {
  const spans = summary.intervals.map((i) => i.to - i.from);
  const closeSpans = spans.filter((d) => d < GAP_MIN_MS);
  if (closeSpans.length === 0) return summary;
  const usual = median(closeSpans);
  const isGap = spans.map((d) => d >= GAP_MIN_MS && d > GAP_FACTOR * usual);
  if (!isGap.some(Boolean)) return summary;

  const shown =
    spans.reduce((sum, d, i) => (isGap[i] ? sum : sum + d), 0) +
    (summary.etaAt === null ? 0 : summary.etaAt - summary.lastAt);
  const gaps = summary.intervals.filter((_, i) => isGap[i]);
  const width = Math.min(
    Math.max(BREAK_MIN_MS, shown * BREAK_SHARE),
    ...gaps.map((g) => g.to - g.from)
  );

  const squeezed = (t: number): number =>
    gaps.reduce((sum, g) => (g.to <= t ? sum + (g.to - g.from - width) : sum), 0);
  const toAxis = (t: number): number => t - squeezed(t);

  const breaks: AxisBreak[] = gaps.map((g) => ({
    from: toAxis(g.from),
    to: toAxis(g.from) + width,
    realFrom: g.from,
    realTo: g.to,
  }));
  const toTime = (x: number): number => {
    let shift = 0;
    for (const b of breaks) if (b.to <= x) shift += b.realTo - b.realFrom - width;
    return x + shift;
  };

  const end = summary.etaAt ?? summary.lastAt;
  const edges = [summary.firstAt, ...gaps.flatMap((g) => [g.from, g.to]), end];
  const ticks: number[] = [];
  const dateTicks = new Set<number>();
  for (let i = 0; i < edges.length; i += 2) {
    const own = timeTicks(edges[i], edges[i + 1]).map(toAxis);
    const stretch = own.length > 0 ? own : [toAxis(edges[i])];
    dateTicks.add(stretch[0]);
    ticks.push(...stretch);
  }

  return {
    ...summary,
    firstAt: toAxis(summary.firstAt),
    lastAt: toAxis(summary.lastAt),
    etaAt: summary.etaAt === null ? null : toAxis(summary.etaAt),
    finishedAt: summary.finishedAt === null ? null : toAxis(summary.finishedAt),
    points: summary.points.map((p) => ({ ...p, at: toAxis(p.at) })),
    intervals: summary.intervals.map((i, n) => ({
      ...i,
      from: toAxis(i.from),
      to: isGap[n] ? toAxis(i.from) + width : toAxis(i.to),
      ...(isGap[n] ? { gap: true as const } : {}),
    })),
    axis: { breaks, ticks, dateTicks, toTime },
  };
}

export const realTime = (summary: SurveySummary, x: number): number =>
  summary.axis ? summary.axis.toTime(x) : x;
