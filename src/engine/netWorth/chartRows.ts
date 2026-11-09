/**
 * Chart-ready rows for the net worth chart (issue #2935): one stacked row per
 * day for a single Character, one value per Character per day for several.
 * Pure; the Recharts component only draws what these say.
 */
import { DAY_MS } from '@/lib/age';
import {
  estimateLayers,
  netWorthOf,
  type CharacterSeries,
  type LayerId,
  type LayerValues,
  type PointKind,
} from './series';

export interface StackRow {
  day: string;
  /** UTC midnight, epoch ms — the numeric x axis. */
  x: number;
  kind: PointKind;
  /** True when the day has no snapshot and the layers are a guess. */
  estimated: boolean;
  values: LayerValues;
  total: number;
}

const ZERO: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0, contracts: 0 };

/** Days with no snapshot are drawn from `estimateLayers` and flagged `estimated`. */
export function stackRows(series: CharacterSeries, shown: readonly LayerId[]): StackRow[] {
  const estimates = estimateLayers(series.points);
  return series.points.map((point, i) => {
    const values: LayerValues = { ...ZERO };
    const source = estimates[i];
    for (const id of shown) {
      if (source) values[id] = source[id];
      else if (id === 'isk') values.isk = point.isk ?? 0;
    }
    return {
      day: point.day,
      x: Date.parse(point.day),
      kind: point.kind,
      estimated: point.kind !== 'snapshot' && estimates[i] !== null,
      values,
      total: netWorthOf(values, shown),
    };
  });
}

/** The last `days` days of rows, counted back from the newest row. Rows are daily and ascending. */
export function lastDays<R extends { x: number }>(rows: readonly R[], days: number): R[] {
  const newest = rows[rows.length - 1]?.x;
  if (newest === undefined) return [];
  const from = newest - (days - 1) * DAY_MS;
  return rows.filter((row) => row.x >= from);
}

export type LineRow = { day: string; x: number } & Record<string, number | string | null>;

/** Key of a Character's value in a `LineRow`. */
export function lineKey(characterId: number): string {
  return `c${characterId}`;
}

/**
 * Per-Character net worth by day. A day with no snapshot plots the estimate
 * from `estimateLayers`, so a missed day joins its neighbours instead of
 * dipping to the wallet alone.
 */
export function lineRows(
  seriesById: ReadonlyMap<number, CharacterSeries>,
  shown: readonly LayerId[]
): LineRow[] {
  const byDay = new Map<string, LineRow>();
  for (const [characterId, series] of seriesById) {
    const estimates = estimateLayers(series.points);
    series.points.forEach((point, i) => {
      const row = byDay.get(point.day) ?? { day: point.day, x: Date.parse(point.day) };
      const values = estimates[i];
      row[lineKey(characterId)] = values
        ? netWorthOf(values, shown)
        : shown.includes('isk')
          ? point.isk
          : null;
      byDay.set(point.day, row);
    });
  }
  const rows = [...byDay.values()].sort((a, b) => a.x - b.x);
  for (const row of rows) {
    for (const characterId of seriesById.keys()) {
      row[lineKey(characterId)] ??= null;
    }
  }
  return rows;
}

export interface TooltipLine<L> {
  line: L;
  /** The line's position in the chart's own order: what picks its colour and dash. */
  colorIndex: number;
  value: number | null;
}

/**
 * One day's tooltip entries, highest value first so the list reads in the
 * order the dots stack. Ties keep chart line order; Characters with no point
 * that day go last.
 */
export function tooltipLines<L extends { characterId: number }>(
  row: LineRow,
  lines: readonly L[]
): TooltipLine<L>[] {
  return lines
    .map((line, colorIndex) => {
      const value = row[lineKey(line.characterId)];
      return { line, colorIndex, value: typeof value === 'number' ? value : null };
    })
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0);
      }
      return b.value - a.value;
    });
}
