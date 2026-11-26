import type { SurveySummary } from '@/engine/survey/series';

export type ChartColor =
  'accent' | 'neutral' | 'warning' | 'iskPos' | 'iskNeg' | 's1' | 's2' | 's3' | 's4' | 's5';

export interface ChartTip {
  title: string;
  rows: { label: string; value: string; tone?: 'good' | 'bad' }[];
}

interface ChartBase {
  summary: string;
  note?: string;
}

export interface AreaChartModel extends ChartBase {
  kind: 'area';
  values: number[];
  low: string;
  high: string;
  rangeLabel?: string;
  tips?: ChartTip[];
}

export interface BarsChartModel extends ChartBase {
  kind: 'bars';
  values: number[];
  max: string;
  xStart?: string;
  xEnd?: string;
  ref?: { value: number; label: string };
  gains?: boolean;
  barLabels?: string[];
  tips?: ChartTip[];
}

export interface HBarRow {
  key: string;
  label: string;
  share: number;
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
  of?: number;
  centre: string;
  centreNote: string;
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  text: string;
  color: ChartColor;
  unlabelled?: boolean;
}

export interface StackChartModel extends ChartBase {
  kind: 'stack';
  parts: StackPart[];
}

export interface StackedAreaChartModel extends ChartBase {
  kind: 'stackedArea';
  layers: { key: string; values: number[]; color: ChartColor }[];
  parts: StackPart[];
  max: string;
  xStart?: string;
  xEnd?: string;
  tips?: ChartTip[];
}

export interface StackRow {
  key: string;
  label: string;
  parts: { key: string; value: number; color: ChartColor }[];
  text?: string;
}

export interface StackRowsChartModel extends ChartBase {
  kind: 'stackRows';
  rows: StackRow[];
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
  startMs: number;
  endMs: number;
  text: string;
  color: ChartColor;
}

export interface GanttChartModel extends ChartBase {
  kind: 'gantt';
  rows: GanttRow[];
  axis: { from: number; to: number; now: number };
  labels: { from: string; now: string; to: string };
  fallback: HBarsChartModel;
}

export interface SurveyChartModel extends ChartBase {
  kind: 'survey';
  data: SurveySummary;
}

export interface OmegaChartModel extends ChartBase {
  kind: 'omega';
  bars: { key: string; label: string; net: number; partial: boolean; tip: ChartTip }[];
  lines: { value: number; label: string }[];
}

export interface LinesChartModel extends ChartBase {
  kind: 'lines';
  series: {
    key: string;
    label: string;
    color: ChartColor;
    end: string;
    values: (number | null)[];
  }[];
  low?: string;
  high?: string;
  rangeLabel?: string;
  xStart?: string;
  xEnd?: string;
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
