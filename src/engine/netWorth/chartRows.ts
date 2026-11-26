import { DAY_MS } from '@/lib/age';
import { utcDay } from './snapshot';
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
  x: number;
  kind: PointKind;
  estimated: boolean;
  values: LayerValues;
  total: number;
}

const ZERO: LayerValues = { isk: 0, assets: 0, escrow: 0, sellOrders: 0, contracts: 0 };

export const guessStackRow = (first: StackRow): StackRow => ({
  ...first,
  kind: 'wallet-only',
  estimated: true,
});

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

export function lastDays<R extends { day: string; x: number }>(
  rows: readonly R[],
  days: number,
  guess: (first: R) => R = (first) => first
): R[] {
  const first = rows[0];
  const newest = rows[rows.length - 1]?.x;
  if (!first || newest === undefined) return [];
  const from = newest - (days - 1) * DAY_MS;
  const padding: R[] = [];
  for (let x = from; x < first.x; x += DAY_MS) {
    padding.push({ ...guess(first), day: utcDay(x), x });
  }
  return [...padding, ...rows.filter((row) => row.x >= from)];
}

export type LineRow = { day: string; x: number } & Record<string, number | string | null>;

export function lineKey(characterId: number): string {
  return `c${characterId}`;
}

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
  colorIndex: number;
  value: number | null;
}

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
