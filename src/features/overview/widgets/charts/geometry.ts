import { HOUR_MS, DAY_MS } from '@/lib/age';

const MIN_BAR_PERCENT = 3;

export interface AreaGeometry {
  line: string[];
  polygon: string;
}

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

export function areaPoints(values: readonly number[], height: number): AreaGeometry {
  const line = areaCoords(values, height).map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`);
  if (line.length === 0) return { line: [], polygon: '' };
  return { line, polygon: `0,${height} ${line.join(' ')} 100,${height}` };
}

export interface BarGeometry {
  heights: number[];
  peak: number | null;
}

export function barHeights(values: readonly number[]): BarGeometry {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max <= 0) return { heights: values.map(() => 0), peak: null };
  return {
    heights: values.map((v) => (v <= 0 ? 0 : Math.max(MIN_BAR_PERCENT, (v / max) * 100))),
    peak: values.indexOf(max),
  };
}

export function sharesOfMax(values: readonly number[]): number[] {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  return values.map((v) => (max <= 0 || v <= 0 ? 0 : v / max));
}

export function hbarPercent(share: number): number {
  if (!(share > 0)) return 0;
  return Math.min(100, Math.max(MIN_BAR_PERCENT, share * 100));
}

export function stackPercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  return values.map((v) => (total <= 0 ? 0 : (Math.max(0, v) / total) * 100));
}

export interface DonutSegment {
  dash: number;
  gap: number;
  offset: number;
}

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

export function stackedAreaBands(layers: readonly (readonly number[])[], height: number): string[] {
  const points = layers[0]?.length ?? 0;
  if (points < 2) return [];
  const totals = Array.from({ length: points }, (_, i) =>
    layers.reduce((sum, layer) => sum + Math.max(0, layer[i] ?? 0), 0)
  );
  const max = Math.max(...totals);
  if (max <= 0) return [];
  const y = (value: number) => (height - (value / max) * (height - 4)).toFixed(1);
  const x = (i: number) => ((i / (points - 1)) * 100).toFixed(0);
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

export const GANTT_LOOK_BACK_MS = DAY_MS;
export const GANTT_LOOK_AHEAD_MS = 14 * DAY_MS;
const GANTT_MIN_AHEAD_MS = HOUR_MS;
const MIN_GANTT_BAR_PERCENT = 2;

export interface GanttAxis {
  from: number;
  to: number;
  now: number;
}

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
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

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

export function ganttNowPercent(axis: GanttAxis): number {
  const span = axis.to - axis.from || 1;
  return Math.min(100, Math.max(0, ((axis.now - axis.from) / span) * 100));
}

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
      run.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    if (run.length > 0) runs.push(run);
    return runs.filter((r) => r.length > 1).map((r) => r.join(' '));
  });
}

export function runFills(runs: readonly string[], height: number): string[] {
  return runs.map((run) => {
    const pts = run.split(' ');
    const x = (pt: string) => pt.split(',')[0]!;
    return `${run} ${x(pts[pts.length - 1]!)},${height} ${x(pts[0]!)},${height}`;
  });
}
