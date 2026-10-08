/**
 * Chart-ready rows for the net worth chart (issue #2935): one stacked row per
 * day for a single Character, one value per Character per day for several.
 * Pure; the Recharts component only draws what these say.
 */
import {
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
  values: LayerValues;
  total: number;
}

const ZERO: LayerValues = { isk: 0, assets: 0, plex: 0, escrow: 0, sellOrders: 0 };

/** Only the wallet exists off a snapshot day; the other layers are drawn as a hatched band, not a value. */
export function stackRows(series: CharacterSeries, shown: readonly LayerId[]): StackRow[] {
  return series.points.map((point) => {
    const values: LayerValues = { ...ZERO };
    for (const id of shown) {
      if (point.layers) values[id] = point.layers[id];
      else if (id === 'isk') values.isk = point.isk ?? 0;
    }
    return {
      day: point.day,
      x: Date.parse(point.day),
      kind: point.kind,
      values,
      total: netWorthOf(values, shown),
    };
  });
}

export type LineRow = { day: string; x: number } & Record<string, number | string | null>;

/** Key of a Character's value in a `LineRow`. */
export function lineKey(characterId: number): string {
  return `c${characterId}`;
}

/**
 * Per-Character net worth by day. A snapshot day plots the shown layers'
 * total; any other day plots the wallet only when ISK is the only layer shown,
 * and is a break otherwise — a wallet-only value would read as a collapse.
 */
export function lineRows(
  seriesById: ReadonlyMap<number, CharacterSeries>,
  shown: readonly LayerId[]
): LineRow[] {
  const byDay = new Map<string, LineRow>();
  const walletOnly = shown.length === 1 && shown[0] === 'isk';
  for (const [characterId, series] of seriesById) {
    for (const point of series.points) {
      const row = byDay.get(point.day) ?? { day: point.day, x: Date.parse(point.day) };
      row[lineKey(characterId)] = point.layers
        ? netWorthOf(point.layers, shown)
        : walletOnly
          ? point.isk
          : null;
      byDay.set(point.day, row);
    }
  }
  const rows = [...byDay.values()].sort((a, b) => a.x - b.x);
  for (const row of rows) {
    for (const characterId of seriesById.keys()) {
      row[lineKey(characterId)] ??= null;
    }
  }
  return rows;
}
