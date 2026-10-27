/**
 * Survey chart views: what each selectable chart plots, as plain rows. Pure —
 * the page draws them; nothing here knows about Recharts or colours beyond the
 * ore's index in `oreNames`, which keeps a layer's colour whatever else is dropped.
 */
import type { SurveySummary } from './series';

export type SurveyChartView = 'ore' | 'depletion' | 'isk';

/** ISK view needs ISK on the rows and at least one ore with a market price. */
export function availableChartViews(summary: SurveySummary): SurveyChartView[] {
  const views: SurveyChartView[] = ['ore', 'depletion'];
  if (summary.iskLeft !== null && summary.ores.some((o) => o.unitPrice !== null)) {
    views.push('isk');
  }
  return views;
}

/** One chart row: a time, plus a value per series key. */
export type SurveySeriesRow = { at: number } & Record<string, number | undefined>;

const clampPercent = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Percent left per ore (of that ore's `startVolume`) at each scan, plus `all`
 * for the whole field. An ore is omitted from a row until a scan at or before
 * it has shown the ore with a rock, so its line starts at its first scan; once
 * shown, an ore mined out stays in at 0.
 */
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
  /** `total` is the stack height: the priced ores' ISK only. */
  rows: SurveySeriesRow[];
  /** Ores in the stack, in `oreNames` order. */
  pricedOres: string[];
  /** Ores with no market price; they drop out of the stack. */
  unpricedOres: string[];
  /** Each ore's index in `summary.oreNames`, for its colour. */
  toneIndex: Record<string, number>;
}

/** ISK left per priced ore at each scan, with the ISK mined since the previous scan and a run to zero at the ETA. */
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

/** One scan interval of the pace chart. */
export interface PaceInterval {
  from: number;
  to: number;
  /**
   * Percent of the ore's starting total (`SurveyOre.startVolume`) mined in this interval, raw
   * (not per hour: a long gap reads as a tall value). Only ores mined in it are present.
   */
  percents: Record<string, number>;
  /** Each mined ore's share of the interval's progress, 0-100; sums to 100, or `{}` when idle. */
  shares: Record<string, number>;
  /** m³ mined in the interval as a percent of every ore's starting volume together. */
  progress: number;
}

/** One invisible plot row the pace chart's tooltip snaps to. */
export interface PaceRow {
  at: number;
  /** Index into `intervals`, or -1 for the tail row past the last scan (no tooltip there). */
  interval: number;
  /** A constant series so the chart has something to hover. */
  idle: 0;
}

export interface PaceShareSeries {
  /** One entry per interval, for the bars, the tooltip and the table. */
  intervals: PaceInterval[];
  /**
   * Tooltip rows: each interval's start, middle and 1 ms before its end, then one at the last scan
   * (interval -1) so hovering the projected stretch after it snaps there, not to the last interval.
   */
  rows: PaceRow[];
  /** Ores mined in at least one interval, in `oreNames` order. */
  activeOres: string[];
  /** Each ore's index in `summary.oreNames`, for its colour. */
  toneIndex: Record<string, number>;
}

/**
 * The Depletion view's pace chart: per scan interval, each ore's share of that interval's
 * progress. Progress per ore is the percent of its starting total mined (the denominator is fixed
 * per ore, `startVolume`, as the depletion lines use), so ores of any size count alike; shares are
 * those percents normalised to sum to 100.
 */
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
    for (const [ore, volume] of Object.entries(i.minedByOre)) {
      const start = startOf.get(ore) ?? 0;
      // A start of 0 cannot come out of summarizeSurvey with mining against it; skip rather than divide.
      if (volume <= 0 || start <= 0) continue;
      // Clamped as depletionSeries is, so a rounding quirk can never push a percent past 100.
      const percent = clampPercent((volume / start) * 100);
      percents[ore] = percent;
      sum += percent;
      active.add(ore);
    }
    const shares: Record<string, number> = {};
    if (sum > 0)
      for (const [ore, percent] of Object.entries(percents)) shares[ore] = (percent / sum) * 100;
    const progress =
      summary.startVolume > 0 ? clampPercent((i.mined / summary.startVolume) * 100) : 0;
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
