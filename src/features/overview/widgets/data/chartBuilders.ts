/**
 * Chart models for the kinds whose numbers the adapters already hold. Pure:
 * plain figures and a translate function in, a `ChartModel` out (or null when
 * there is nothing honest to draw, so the Chart view falls back to the
 * Number rather than drawing an empty frame).
 *
 * Honesty rules from the design record: Orders is Not undercut against
 * Undercut with expiring a separate count; bars carry their max and their time
 * range; every model carries a hidden text summary; no series is red.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type {
  AreaChartModel,
  BarsChartModel,
  ChartColor,
  DonutChartModel,
  HBarRow,
  HBarsChartModel,
  StackChartModel,
} from '../charts/types';
import { sharesOfMax } from '../charts/geometry';
import { forwardBucketCounts } from './chartSeries';
import type { Translate } from './types';

const K = 'overview.widgets.chart';
const HOUR_MS = 3_600_000;
/** Hours the industry chart looks ahead. */
export const INDUSTRY_CHART_HOURS = 12;

/** A status colour for a row whose length is itself an urgency (time left to act). */
export function severityColor(severity: DeadlineSeverity): ChartColor {
  return severity === 'warning' || severity === 'critical' ? 'warning' : 'accent';
}

export function ordersDonut(
  t: Translate,
  input: { open: number; undercut: number; expiring: number }
): DonutChartModel {
  const { open, undercut, expiring } = input;
  return {
    kind: 'donut',
    parts: [
      {
        key: 'notUndercut',
        label: t(`${K}.orders.notUndercut`),
        value: Math.max(0, open - undercut),
        color: 'neutral',
      },
      { key: 'undercut', label: t(`${K}.orders.undercut`), value: undercut, color: 'warning' },
    ],
    centre: String(open),
    centreNote: t(`${K}.orders.open`),
    note: expiring > 0 ? t(`${K}.orders.note`, { count: expiring }) : undefined,
    summary: t(`${K}.orders.summary`, { undercut, open, expiring }),
  };
}

/** Jobs finishing in each of the next hours, those already done counted in the first. Null with no jobs. */
export function industryBars(
  t: Translate,
  endTimes: readonly number[],
  now: number
): BarsChartModel | null {
  if (endTimes.length === 0) return null;
  const { counts, later } = forwardBucketCounts(endTimes, now, HOUR_MS, INDUSTRY_CHART_HOURS);
  const tallest = Math.max(...counts);
  return {
    kind: 'bars',
    values: counts,
    max: t(`${K}.industry.max`, { count: tallest }),
    xStart: t(`${K}.now`),
    xEnd: t(`${K}.inHours`, { count: INDUSTRY_CHART_HOURS }),
    note: t(`${K}.industry.note`),
    summary: t(`${K}.industry.summary`, {
      total: endTimes.length,
      ready: endTimes.filter((at) => at <= now).length,
      hours: INDUSTRY_CHART_HOURS,
      later,
    }),
  };
}

export interface HBarInput {
  key: string;
  label: string;
  value: number;
  text: string;
  color?: ChartColor;
  /** 0..1, for a figure that is already a share of something; otherwise relative to the largest row. */
  share?: number;
}

/** Horizontal bars with a generic "note: label figure, ..." summary; null with no rows. */
export function hbarsFromRows(
  t: Translate,
  rows: readonly HBarInput[],
  note: string
): HBarsChartModel | null {
  if (rows.length === 0) return null;
  const relative = sharesOfMax(rows.map((row) => row.value));
  const out: HBarRow[] = rows.map((row, i) => ({
    key: row.key,
    label: row.label,
    share: row.share ?? relative[i]!,
    text: row.text,
    color: row.color,
  }));
  return {
    kind: 'hbars',
    rows: out,
    note,
    summary: t(`${K}.listSummary`, {
      note,
      items: rows.map((row) => `${row.label} ${row.text}`).join(', '),
    }),
  };
}

/** A balance line over the days we actually know; null under two days. */
export function walletArea(
  t: Translate,
  series: { days: readonly string[]; values: readonly number[] },
  format: (value: number) => string
): AreaChartModel | null {
  const { values } = series;
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  return {
    kind: 'area',
    values: [...values],
    low: t(`${K}.low`, { value: format(low) }),
    high: t(`${K}.high`, { value: format(high) }),
    rangeLabel: t(`${K}.span`, { count: values.length }),
    summary: t(`${K}.wallet.summary`, {
      from: format(values[0]!),
      to: format(values[values.length - 1]!),
      days: values.length,
      low: format(low),
      high: format(high),
    }),
  };
}

export interface QueueSegment {
  entry: SkillQueueEntry;
  seconds: number;
}

/**
 * How long each unfinished skill in the queue takes, in queue order: the
 * running skill from now, a later one from its own start (or the previous
 * skill's finish when ESI gave none). A skill with no finish time is left out.
 */
export function queueSegments(entries: readonly SkillQueueEntry[], now: number): QueueSegment[] {
  const out: QueueSegment[] = [];
  let previousFinish: number | null = null;
  for (const entry of entries) {
    const finish = entry.finish_date ? Date.parse(entry.finish_date) : null;
    if (finish === null || Number.isNaN(finish) || finish <= now) continue;
    const declaredStart = entry.start_date ? Date.parse(entry.start_date) : null;
    const start = Math.max(
      now,
      declaredStart !== null && !Number.isNaN(declaredStart)
        ? declaredStart
        : (previousFinish ?? now)
    );
    out.push({ entry, seconds: Math.max(0, finish - start) / 1000 });
    previousFinish = finish;
  }
  return out;
}

export interface QueueStackInput {
  key: string;
  label: string;
  seconds: number;
}

/**
 * The whole skill queue as one bar: a part per skill, each as long as it trains,
 * the running one in the accent. The legend names the first two (a long queue
 * would drown the widget); the caption says when the queue ends. Null when empty.
 */
export function queueStack(
  t: Translate,
  items: readonly QueueStackInput[],
  format: (seconds: number) => string
): StackChartModel | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.seconds, 0);
  const note = t(`${K}.training.note`, { duration: format(total) });
  return {
    kind: 'stack',
    parts: items.map((item, i) => ({
      key: item.key,
      label: item.label,
      value: item.seconds,
      text: format(item.seconds),
      color: i === 0 ? 'accent' : i === 1 ? 's1' : 'neutral',
      unlabelled: i >= 2 || undefined,
    })),
    note,
    summary: t(`${K}.listSummary`, {
      note,
      items: items.map((item) => `${item.label} ${format(item.seconds)}`).join(', '),
    }),
  };
}
