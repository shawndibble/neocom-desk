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

/** Points for an area/line chart in a `100 x height` viewBox. Fewer than two values draw nothing. */
export function areaPoints(values: readonly number[], height: number): AreaGeometry {
  if (values.length < 2) return { line: [], polygon: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const line = values.map((value, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = height - 4 - ((value - min) / span) * (height - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
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

export interface DivergingGeometry {
  /** Each bar above the axis, as a percentage of the region above it. */
  up: number[];
  /** Each bar below the axis, as a percentage of the region below it. */
  down: number[];
  /** The share of the chart's height above the axis, 0.2 to 0.8. */
  split: number;
}

const MIN_SPLIT = 0.2;

/**
 * Heights for paired bars either side of an axis. The axis sits where it
 * gives both sides the same pixels-per-ISK (income that is four times
 * spending gets four times the room), but never closer than a fifth of the
 * height to an edge, so a small side still reads. A zero draws nothing; any
 * other value is never thinner than a visible sliver.
 */
export function divergingHeights(
  up: readonly number[],
  down: readonly number[]
): DivergingGeometry {
  const maxUp = up.reduce((m, v) => Math.max(m, v), 0);
  const maxDown = down.reduce((m, v) => Math.max(m, v), 0);
  const total = maxUp + maxDown;
  const split = total <= 0 ? 0.5 : Math.min(1 - MIN_SPLIT, Math.max(MIN_SPLIT, maxUp / total));
  const scale = (max: number) => (v: number) =>
    max <= 0 || v <= 0 ? 0 : Math.max(MIN_BAR_PERCENT, (v / max) * 100);
  return { up: up.map(scale(maxUp)), down: down.map(scale(maxDown)), split };
}
