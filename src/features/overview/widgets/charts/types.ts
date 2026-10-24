/**
 * Plain data models for the widget charts. A kind's adapter builds one (with
 * every string already translated and formatted), the chart component only
 * draws it. Nothing here knows React, Dexie or fetch.
 *
 * Every model carries a `summary`: the visually hidden text equivalent that a
 * screen reader gets in place of the aria-hidden drawing. Colour is never the
 * only signal, so every colour also has a label, a legend entry or a figure.
 */

import type { SurveySummary } from '@/engine/survey/series';

/**
 * Where a series' hue comes from. There is no chart palette (DESIGN.md "Chart
 * series": categorical sets borrow the app's existing tokens): `s1`..`s5` are
 * the nominal clock-kind hues the Net Worth page already uses, none of them red.
 */
export type ChartColor =
  'accent' | 'neutral' | 'warning' | 'iskPos' | 'iskNeg' | 's1' | 's2' | 's3' | 's4' | 's5';

/** What a hover (or a tap) reads out for one point: a title and labelled figures. */
export interface ChartTip {
  title: string;
  rows: { label: string; value: string; tone?: 'good' | 'bad' }[];
}

interface ChartBase {
  /** The visually hidden text equivalent. */
  summary: string;
  /** One caption line under the drawing ("Jobs finishing each hour"). */
  note?: string;
}

export interface AreaChartModel extends ChartBase {
  kind: 'area';
  /** Oldest first. */
  values: number[];
  /** Axis labels, already formatted. */
  low: string;
  high: string;
  /** The span, shown beside the high label ("30 days"). */
  rangeLabel?: string;
  /** One readout per value, same length as `values`. */
  tips?: ChartTip[];
}

export interface BarsChartModel extends ChartBase {
  kind: 'bars';
  /** Oldest first. A negative value draws below a zero axis. */
  values: number[];
  /** "max 3 jobs": the tallest bar's value, already formatted. */
  max: string;
  /** The time range's two ends ("30 days ago", "today"). */
  xStart?: string;
  xEnd?: string;
  /** A dashed reference line across the bars (a daily average); its value is on the bars' own scale. */
  ref?: { value: number; label: string };
  /** Gains and losses: green above the axis, red below it, instead of the accent. */
  gains?: boolean;
  /** A figure printed beside each bar (above a gain, below a loss), same length as `values`. A narrow chart prints only every few, newest first. */
  barLabels?: string[];
  /** One readout per value, same length as `values`. */
  tips?: ChartTip[];
}

export interface HBarRow {
  key: string;
  label: string;
  /** 0..1 against the longest row. */
  share: number;
  /** The figure at the row's end. */
  text: string;
  color?: ChartColor;
}

export interface HBarsChartModel extends ChartBase {
  kind: 'hbars';
  rows: HBarRow[];
}

export interface DonutPart {
  key: string;
  label: string;
  value: number;
  color: ChartColor;
}

export interface DonutChartModel extends ChartBase {
  kind: 'donut';
  parts: DonutPart[];
  /** Big text in the hole, and the small word under it. */
  centre: string;
  centreNote: string;
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  /** The legend figure ("29.3B"). */
  text: string;
  color: ChartColor;
  /** Drawn in the bar but left out of the legend (a long queue names only its first parts). */
  unlabelled?: boolean;
}

export interface StackChartModel extends ChartBase {
  kind: 'stack';
  /** In bar order; the legend follows it. */
  parts: StackPart[];
}

export interface StackedAreaChartModel extends ChartBase {
  kind: 'stackedArea';
  /** Bottom layer first; every layer has the same number of points, oldest first. */
  layers: { key: string; values: number[]; color: ChartColor }[];
  /** The latest day as legend parts, in layer order; also what Small draws as one bar. */
  parts: StackPart[];
  /** The tallest total, already formatted. */
  max: string;
  xStart?: string;
  xEnd?: string;
  /** One readout per day, same length as every layer's values. */
  tips?: ChartTip[];
}

export interface StackRow {
  key: string;
  label: string;
  /** In bar order; zero parts draw nothing but keep the order. */
  parts: { key: string; value: number; color: ChartColor }[];
  /** The figure at the row's end ("3 short"). */
  text?: string;
}

export interface StackRowsChartModel extends ChartBase {
  kind: 'stackRows';
  rows: StackRow[];
  /** One entry per part key, with its total across the rows, in bar order. */
  legend: StackPart[];
}

export interface SparkRow {
  key: string;
  label: string;
  values: number[];
  text: string;
  color?: ChartColor;
}

export interface SparkChartModel extends ChartBase {
  kind: 'spark';
  rows: SparkRow[];
}

export interface GanttRow {
  key: string;
  label: string;
  /** ms since the epoch. */
  startMs: number;
  endMs: number;
  /** The figure at the row's end ("5h 2m", "Ready"). */
  text: string;
  color: ChartColor;
}

export interface GanttChartModel extends ChartBase {
  kind: 'gantt';
  /** In row order, as drawn. */
  rows: GanttRow[];
  /** The shared time axis, ms since the epoch. */
  axis: { from: number; to: number; now: number };
  /** The axis's three labels, already formatted; `from` is empty when the axis starts at now. */
  labels: { from: string; now: string; to: string };
  /** What Small draws instead: a Gantt needs width. */
  fallback: HBarsChartModel;
}

export interface SurveyChartModel extends ChartBase {
  kind: 'survey';
  /** The Survey tab's own series; drawn by its lazy Recharts volume chart, so this stays data. */
  data: SurveySummary;
}

export interface OmegaChartModel extends ChartBase {
  kind: 'omega';
  /** One per 30-day period, oldest first. */
  bars: { key: string; label: string; net: number; partial: boolean; tip: ChartTip }[];
  /** Horizontal reference lines at 1x, 2x... one account's cost; `value` is ISK, `label` is "2 accounts". */
  lines: { value: number; label: string }[];
}

export interface LinesChartModel extends ChartBase {
  kind: 'lines';
  /** Each shares the day axis and the vertical scale; `null` is a day with no trade. */
  series: {
    key: string;
    label: string;
    color: ChartColor;
    /** Where the line ends, already formatted ("+12.4%"), shown in the legend. */
    end: string;
    values: (number | null)[];
  }[];
  /** The scale's two ends, already formatted; omitted when the title and tooltips carry them. */
  low?: string;
  high?: string;
  rangeLabel?: string;
  /** One readout per day, listing every line. */
  tips?: ChartTip[];
}

export type ChartModel =
  | AreaChartModel
  | BarsChartModel
  | HBarsChartModel
  | GanttChartModel
  | DonutChartModel
  | StackChartModel
  | StackedAreaChartModel
  | StackRowsChartModel
  | SparkChartModel
  | SurveyChartModel
  | OmegaChartModel
  | LinesChartModel;

export type ChartKind = ChartModel['kind'];
