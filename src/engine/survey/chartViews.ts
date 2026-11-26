import type { SurveySummary } from './series';

export type SurveyChartView = 'ore' | 'depletion' | 'isk';

export function availableChartViews(summary: SurveySummary): SurveyChartView[] {
  const views: SurveyChartView[] = ['ore', 'depletion'];
  if (summary.iskLeft !== null && summary.ores.some((o) => o.unitPrice !== null)) {
    views.push('isk');
  }
  return views;
}

export type SurveySeriesRow = { at: number } & Record<string, number | undefined>;

const clampPercent = (v: number): number => Math.min(100, Math.max(0, v));

export function depletionSeries(summary: SurveySummary): SurveySeriesRow[] {
  const startOf = new Map(summary.ores.map((o) => [o.ore, o.startVolume]));
  const shown = new Set<string>();
  return summary.points.map((p) => {
    const row: SurveySeriesRow = {
      at: p.at,
      all: summary.startVolume > 0 ? clampPercent((p.total / summary.startVolume) * 100) : 0,
    };
    for (const ore of Object.keys(p.byOre)) shown.add(ore);
    for (const ore of summary.oreNames) {
      if (!shown.has(ore)) continue;
      const start = startOf.get(ore) ?? 0;
      row[ore] = start > 0 ? clampPercent(((p.byOre[ore] ?? 0) / start) * 100) : 0;
    }
    return row;
  });
}

export interface IskSeries {
  rows: SurveySeriesRow[];
  pricedOres: string[];
  unpricedOres: string[];
  toneIndex: Record<string, number>;
}

export function iskSeries(summary: SurveySummary): IskSeries {
  const priced = new Set(summary.ores.filter((o) => o.unitPrice !== null).map((o) => o.ore));
  const pricedOres = summary.oreNames.filter((o) => priced.has(o));
  const unpricedOres = summary.oreNames.filter((o) => !priced.has(o));
  const toneIndex: Record<string, number> = {};
  summary.oreNames.forEach((ore, i) => {
    toneIndex[ore] = i;
  });

  const rows: SurveySeriesRow[] = summary.points.map((p, i) => {
    const row: SurveySeriesRow = { at: p.at, total: 0 };
    let total = 0;
    for (const ore of pricedOres) {
      const isk = p.iskByOre[ore] ?? 0;
      row[ore] = isk;
      total += isk;
    }
    row.total = total;
    if (i > 0) row.minedIsk = summary.intervals[i - 1].minedIsk;
    return row;
  });
  if (summary.etaAt !== null) {
    rows[rows.length - 1].projected = rows[rows.length - 1].total;
    rows.push({ at: summary.etaAt, projected: 0 });
  }
  return { rows, pricedOres, unpricedOres, toneIndex };
}

export interface PaceInterval {
  from: number;
  to: number;
  percents: Record<string, number>;
  shares: Record<string, number>;
  progress: number;
}

export interface PaceRow {
  at: number;
  interval: number;
  idle: 0;
}

export interface PaceShareSeries {
  intervals: PaceInterval[];
  rows: PaceRow[];
  activeOres: string[];
  toneIndex: Record<string, number>;
}

export function paceShareSeries(summary: SurveySummary): PaceShareSeries {
  const toneIndex: Record<string, number> = {};
  summary.oreNames.forEach((ore, i) => {
    toneIndex[ore] = i;
  });
  const startOf = new Map(summary.ores.map((o) => [o.ore, o.startVolume]));
  const active = new Set<string>();

  const raw = summary.intervals.map((i) => {
    const percents: Record<string, number> = {};
    let sum = 0;
    for (const [ore, volume] of Object.entries(i.gap ? {} : i.minedByOre)) {
      const start = startOf.get(ore) ?? 0;
      if (volume <= 0 || start <= 0) continue;
      const percent = clampPercent((volume / start) * 100);
      percents[ore] = percent;
      sum += percent;
      active.add(ore);
    }
    const shares: Record<string, number> = {};
    if (sum > 0)
      for (const [ore, percent] of Object.entries(percents)) shares[ore] = (percent / sum) * 100;
    const progress =
      summary.startVolume > 0 && !i.gap ? clampPercent((i.mined / summary.startVolume) * 100) : 0;
    return { from: i.from, to: i.to, percents, shares, progress };
  });
  const intervals: PaceInterval[] = raw;
  const activeOres = summary.oreNames.filter((o) => active.has(o));
  const rows: PaceRow[] = intervals.flatMap((i, interval) => [
    { at: i.from, interval, idle: 0 as const },
    { at: (i.from + i.to) / 2, interval, idle: 0 as const },
    { at: i.to - 1, interval, idle: 0 as const },
  ]);
  const last = intervals[intervals.length - 1];
  if (last !== undefined) rows.push({ at: last.to, interval: -1, idle: 0 });
  return { intervals, rows, activeOres, toneIndex };
}
