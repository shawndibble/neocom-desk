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

export interface PaceByOreSeries {
  /**
   * Step rows for a `stepAfter` stack: one per interval at its start, then the last interval's
   * values again at its end so the final block closes. Each ore key is its m³/s over the interval
   * (0 when nobody mined it) and `total` is their sum, which is the interval's `rate`.
   */
  rows: SurveySeriesRow[];
  /** Ores mined in at least one interval, in `oreNames` order. */
  activeOres: string[];
  /** Each ore's index in `summary.oreNames`, for its colour. */
  toneIndex: Record<string, number>;
}

/**
 * The pace panel's "By ore" view: each interval's rate split by ore. Intervals are as long as the
 * gap between scans, so every value is m³ over the interval's own seconds, however uneven.
 */
export function paceByOreSeries(summary: SurveySummary): PaceByOreSeries {
  const toneIndex: Record<string, number> = {};
  summary.oreNames.forEach((ore, i) => {
    toneIndex[ore] = i;
  });
  const mined = new Set<string>();
  for (const i of summary.intervals) for (const ore of Object.keys(i.minedByOre)) mined.add(ore);
  const activeOres = summary.oreNames.filter((o) => mined.has(o));

  const rows: SurveySeriesRow[] = summary.intervals.map((i) => {
    const seconds = (i.to - i.from) / 1000;
    const row: SurveySeriesRow = { at: i.from, total: 0 };
    let total = 0;
    for (const ore of activeOres) {
      const rate = (i.minedByOre[ore] ?? 0) / seconds;
      row[ore] = rate;
      total += rate;
    }
    row.total = total;
    return row;
  });
  const last = summary.intervals[summary.intervals.length - 1];
  if (last !== undefined) rows.push({ ...rows[rows.length - 1], at: last.to });
  return { rows, activeOres, toneIndex };
}
