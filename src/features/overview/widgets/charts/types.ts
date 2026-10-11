/**
 * Plain data models for the widget charts. A kind's adapter builds one (with
 * every string already translated and formatted), the chart component only
 * draws it. Nothing here knows React, Dexie or fetch.
 *
 * Every model carries a `summary`: the visually hidden text equivalent that a
 * screen reader gets in place of the aria-hidden drawing. Colour is never the
 * only signal, so every colour also has a label, a legend entry or a figure.
 */

/**
 * Where a series' hue comes from. There is no chart palette (DESIGN.md "Chart
 * series": categorical sets borrow the app's existing tokens): `s1`..`s5` are
 * the nominal clock-kind hues the Net Worth page already uses, none of them red.
 */
export type ChartColor =
  'accent' | 'neutral' | 'warning' | 'iskPos' | 'iskNeg' | 's1' | 's2' | 's3' | 's4' | 's5';

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

export type ChartModel =
  | AreaChartModel
  | BarsChartModel
  | HBarsChartModel
  | DonutChartModel
  | StackChartModel
  | SparkChartModel;

export type ChartKind = ChartModel['kind'];
