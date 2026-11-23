import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { SurveySummary } from './series';
import { timeTicks } from './timeTicks';

/**
 * A time axis with the long stretches between scans squeezed out. A survey that
 * spans days with hours of no scans would spend most of its chart on a line
 * nobody measured; a gap becomes one short break and the scans either side keep
 * their real spacing. Pure: `compressGaps` returns the summary re-timed onto the
 * squeezed axis, and `axis.toTime` maps a position back to the real clock.
 */

/** A gap this long or more between scans may be broken… */
const GAP_MIN_MS = 2 * HOUR_MS;
/** …when it is also this many times the usual interval between scans. */
const GAP_FACTOR = 3;
/** A break is drawn this wide at least, and this share of the time on the chart outside the gaps (scanned, plus the run to the projected finish). */
const BREAK_MIN_MS = 10 * MINUTE_MS;
const BREAK_SHARE = 0.08;

export interface AxisBreak {
  /** Where the break starts and ends on the squeezed axis. */
  from: number;
  to: number;
  /** The real stretch it stands for. */
  realFrom: number;
  realTo: number;
}

export interface GapAxis {
  breaks: AxisBreak[];
  /** Tick positions on the squeezed axis. */
  ticks: number[];
  /** The ticks that carry a date: the first of each stretch of scans. */
  dateTicks: Set<number>;
  /** The real time at a position on the squeezed axis. */
  toTime: (x: number) => number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** The summary on a squeezed axis, or the same summary when no gap is long enough to break. */
export function compressGaps(summary: SurveySummary): SurveySummary {
  const spans = summary.intervals.map((i) => i.to - i.from);
  if (spans.length < 2) return summary;
  const usual = median(spans);
  const isGap = spans.map((d) => d >= GAP_MIN_MS && d > GAP_FACTOR * usual);
  if (!isGap.some(Boolean)) return summary;

  const shown =
    spans.reduce((sum, d, i) => (isGap[i] ? sum : sum + d), 0) +
    (summary.etaAt === null ? 0 : summary.etaAt - summary.lastAt);
  const width = Math.max(BREAK_MIN_MS, shown * BREAK_SHARE);
  const gaps = summary.intervals.filter((_, i) => isGap[i]);

  // Time squeezed out before a real instant: every gap that has ended by then.
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

  // Ticks per stretch of scans, in real time, then onto the axis.
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

/** The real time at a position on a summary's time axis (the position itself when it is not squeezed). */
export const realTime = (summary: SurveySummary, x: number): number =>
  summary.axis ? summary.axis.toTime(x) : x;
