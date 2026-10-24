/**
 * The arithmetic behind the hand-built widget charts: scaling, polyline
 * points, donut dash arrays. Pure, so each is pinned by a plain test and the
 * components stay thin.
 */

/** A bar that is not zero is never thinner than this, so a small value still reads as there. */
const MIN_BAR_PERCENT = 3;

export interface AreaGeometry {
  /** `x,y` pairs in a 100-wide viewBox, oldest first. */
  line: string[];
  /** The closed shape under the line, for the soft fill. */
  polygon: string;
}

/** Where each value of an area/line chart sits: `x` in 0..100 and `y` in 0..height, oldest first. Fewer than two values give none. */
export function areaCoords(values: readonly number[], height: number): { x: number; y: number }[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, i) => ({
    x: (i / (values.length - 1)) * 100,
    y: height - 4 - ((value - min) / span) * (height - 10),
  }));
}

/** Points for an area/line chart in a `100 x height` viewBox. Fewer than two values draw nothing. */
export function areaPoints(values: readonly number[], height: number): AreaGeometry {
  const line = areaCoords(values, height).map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`); // fixed format: SVG points
  if (line.length === 0) return { line: [], polygon: '' };
  return { line, polygon: `0,${height} ${line.join(' ')} 100,${height}` };
}

export interface BarGeometry {
  /** Each bar's height as a percentage of the chart's height. */
  heights: number[];
  /** Index of the first tallest bar; null when nothing is above zero. */
  peak: number | null;
}

/** Bar heights relative to the tallest. A zero or negative value draws no bar. */
export function barHeights(values: readonly number[]): BarGeometry {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max <= 0) return { heights: values.map(() => 0), peak: null };
  return {
    heights: values.map((v) => (v <= 0 ? 0 : Math.max(MIN_BAR_PERCENT, (v / max) * 100))),
    peak: values.indexOf(max),
  };
}

/** Each value as a 0..1 share of the largest; all zero when there is nothing above zero. */
export function sharesOfMax(values: readonly number[]): number[] {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  return values.map((v) => (max <= 0 || v <= 0 ? 0 : v / max));
}

/** A horizontal bar's width in percent: clamped, and never a sliver that vanishes. */
export function hbarPercent(share: number): number {
  if (!(share > 0)) return 0;
  return Math.min(100, Math.max(MIN_BAR_PERCENT, share * 100));
}

/** Each value's share of the total in percent; all zero for an empty total. */
export function stackPercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  return values.map((v) => (total <= 0 ? 0 : (Math.max(0, v) / total) * 100));
}

export interface DonutSegment {
  dash: number;
  gap: number;
  offset: number;
}

/**
 * Stroke dashes for a donut whose circle has circumference 100 (radius
 * 15.9155), end to end from the top. A zero part keeps an empty segment so
 * indexes still line up with the parts. A zero total draws nothing at all.
 */
export function donutSegments(values: readonly number[]): DonutSegment[] {
  const percents = stackPercents(values);
  if (percents.every((p) => p === 0)) return [];
  let used = 0;
  return percents.map((dash) => {
    const segment = { dash, gap: 100 - dash, offset: used === 0 ? 0 : -used };
    used += dash;
    return segment;
  });
}

/**
 * Closed polygons (`x,y` pairs in a `100 x height` viewBox) for a stacked area,
 * bottom layer first. The scale runs from zero to the tallest total, so a
 * layer's thickness is its real share; a negative value stacks as nothing.
 * Fewer than two points, or nothing above zero, draw nothing.
 */
export function stackedAreaBands(layers: readonly (readonly number[])[], height: number): string[] {
  const points = layers[0]?.length ?? 0;
  if (points < 2) return [];
  const totals = Array.from({ length: points }, (_, i) =>
    layers.reduce((sum, layer) => sum + Math.max(0, layer[i] ?? 0), 0)
  );
  const max = Math.max(...totals);
  if (max <= 0) return [];
  const y = (value: number) => (height - (value / max) * (height - 4)).toFixed(1); // fixed format: SVG coordinate
  const x = (i: number) => ((i / (points - 1)) * 100).toFixed(0); // fixed format: SVG coordinate
  const below = Array<number>(points).fill(0);
  return layers.map((layer) => {
    const upper = layer.map((_, i) => below[i]! + Math.max(0, layer[i] ?? 0));
    const lower = [...below];
    upper.forEach((value, i) => (below[i] = value));
    const top = upper.map((value, i) => `${x(i)},${y(value)}`);
    const bottom = lower.map((value, i) => `${x(i)},${y(value)}`).reverse();
    return [...top, ...bottom].join(' ');
  });
}

/** How far before now a Gantt axis reaches at most, and how far after. */
export const GANTT_LOOK_BACK_MS = 86_400_000;
export const GANTT_LOOK_AHEAD_MS = 14 * 86_400_000;
const GANTT_MIN_AHEAD_MS = 3_600_000;
/** A Gantt bar is never thinner than this (percent of the axis), so a short job still reads as there. */
const MIN_GANTT_BAR_PERCENT = 2;

export interface GanttAxis {
  from: number;
  to: number;
  now: number;
}

/**
 * The shared time axis: from the earliest start to the latest end, but never
 * more than a day before now or two weeks after it, and always holding now with
 * an hour to spare so the marker has somewhere to stand.
 */
export function ganttAxis(
  jobs: readonly { startMs: number; endMs: number }[],
  now: number
): GanttAxis {
  const earliest = jobs.reduce((m, j) => Math.min(m, j.startMs), now);
  const latest = jobs.reduce((m, j) => Math.max(m, j.endMs), now + GANTT_MIN_AHEAD_MS);
  return {
    from: Math.max(earliest, now - GANTT_LOOK_BACK_MS),
    to: Math.min(latest, now + GANTT_LOOK_AHEAD_MS),
    now,
  };
}

export interface GanttBar {
  /** Percent of the axis. */
  left: number;
  width: number;
  /** The job began before the axis starts / ends after it stops: draw an overflow marker. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** One job's bar on the axis, clamped to it and never thinner than a sliver. */
export function ganttBar(startMs: number, endMs: number, axis: GanttAxis): GanttBar {
  const span = axis.to - axis.from || 1;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - axis.from) / span) * 100));
  const left = pct(startMs);
  const width = Math.max(MIN_GANTT_BAR_PERCENT, pct(endMs) - left);
  return {
    left: Math.min(left, 100 - MIN_GANTT_BAR_PERCENT),
    width: Math.min(width, 100 - Math.min(left, 100 - MIN_GANTT_BAR_PERCENT)),
    clippedStart: startMs < axis.from,
    clippedEnd: endMs > axis.to,
  };
}

/** Where the now marker stands, percent of the axis. */
export function ganttNowPercent(axis: GanttAxis): number {
  const span = axis.to - axis.from || 1;
  return Math.min(100, Math.max(0, ((axis.now - axis.from) / span) * 100));
}

/**
 * Polyline point strings (`x,y` pairs in a `100 x height` viewBox) for several
 * series that share one vertical scale, so lines stay comparable. A gap
 * (`null`) breaks a line into separate runs rather than bridging it; a run of
 * one day has no line to draw and is dropped.
 */
export function linesRuns(
  series: readonly (readonly (number | null)[])[],
  height: number
): string[][] {
  const known = series.flatMap((s) => s.filter((v): v is number => v !== null));
  if (known.length === 0) return series.map(() => []);
  const min = Math.min(...known);
  const span = Math.max(...known) - min || 1;
  return series.map((values) => {
    const runs: string[][] = [];
    let run: string[] = [];
    values.forEach((value, i) => {
      if (value === null) {
        if (run.length > 0) runs.push(run);
        run = [];
        return;
      }
      const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
      const y = height - 4 - ((value - min) / span) * (height - 10);
      run.push(`${x.toFixed(1)},${y.toFixed(1)}`); // fixed format: SVG points
    });
    if (run.length > 0) runs.push(run);
    return runs.filter((r) => r.length > 1).map((r) => r.join(' '));
  });
}
