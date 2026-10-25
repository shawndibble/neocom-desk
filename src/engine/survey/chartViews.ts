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

/** One scan interval: how much of each ore's starting total was mined in it. */
export interface PaceInterval {
  from: number;
  to: number;
  /**
   * Percent of the ore's starting total (`SurveyOre.startVolume`) mined in this interval, raw
   * (not per hour: a long gap reads as a tall value). Only ores mined in it are present.
   */
  percents: Record<string, number>;
  /** m³ mined per ore, for the tooltip's secondary figure. */
  minedByOre: Record<string, number>;
}

export interface PaceByOreSeries {
  /** One entry per interval, for tables and the tooltip. */
  intervals: PaceInterval[];
  /**
   * Plot rows for per-ore lines: three per interval (its start, its middle and 1 ms before its
   * end), each with `from`/`to` and a key per ore mined in it. An ore not mined in an interval
   * has no key, so its line breaks. The middle row carries `mid: 1`, where a lone interval gets
   * its dot.
   */
  rows: SurveySeriesRow[];
  /** Ores mined in at least one interval, in `oreNames` order. */
  activeOres: string[];
  /** Each ore's index in `summary.oreNames`, for its colour. */
  toneIndex: Record<string, number>;
  /** The largest percent in any interval; 0 when nothing was mined. */
  maxPercent: number;
}

/**
 * The Depletion view's pace chart: per scan interval, the percent of each ore's starting total
 * that was mined. The denominator is fixed per ore (its `startVolume`, as the depletion lines
 * use), so ores of any size read on the same scale.
 */
export function paceByOreSeries(summary: SurveySummary): PaceByOreSeries {
  const toneIndex: Record<string, number> = {};
  summary.oreNames.forEach((ore, i) => {
    toneIndex[ore] = i;
  });
  const startOf = new Map(summary.ores.map((o) => [o.ore, o.startVolume]));
  const active = new Set<string>();
  let maxPercent = 0;

  const intervals: PaceInterval[] = summary.intervals.map((i) => {
    const percents: Record<string, number> = {};
    const minedByOre: Record<string, number> = {};
    for (const [ore, volume] of Object.entries(i.minedByOre)) {
      const start = startOf.get(ore) ?? 0;
      if (volume <= 0 || start <= 0) continue;
      const percent = clampPercent((volume / start) * 100);
      percents[ore] = percent;
      minedByOre[ore] = volume;
      active.add(ore);
      maxPercent = Math.max(maxPercent, percent);
    }
    return { from: i.from, to: i.to, percents, minedByOre };
  });
  const rows = intervals.flatMap((i) => {
    const row = { from: i.from, to: i.to, ...i.percents };
    return [
      { ...row, at: i.from },
      { ...row, at: (i.from + i.to) / 2, mid: 1 },
      { ...row, at: i.to - 1 },
    ];
  });
  const activeOres = summary.oreNames.filter((o) => active.has(o));
  return { intervals, rows, activeOres, toneIndex, maxPercent };
}
