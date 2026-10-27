/**
 * Chart models for the kinds whose numbers the adapters already hold. Pure:
 * plain figures and a translate function in, a `ChartModel` out (or null when
 * there is nothing honest to draw, so the Chart view falls back to the
 * Number rather than drawing an empty frame).
 *
 * Honesty rules from the design record: bars carry their max and their time
 * range; every model carries a hidden text summary; no series is red.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type {
  AreaChartModel,
  ChartColor,
  HBarRow,
  HBarsChartModel,
  StackChartModel,
} from '../charts/types';
import { sharesOfMax } from '../charts/geometry';
import { dayTitle } from './chartTips';
import type { Translate } from './types';

const K = 'overview.widgets.chart';

/** A status colour for a row whose length is itself an urgency (time left to act). */
export function severityColor(severity: DeadlineSeverity): ChartColor {
  return severity === 'warning' || severity === 'critical' ? 'warning' : 'accent';
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
    tips: values.map((value, i) => ({
      title: dayTitle(series.days[i] ?? ''),
      rows: [{ label: t(`${K}.tip.balance`), value: format(value) }],
    })),
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
