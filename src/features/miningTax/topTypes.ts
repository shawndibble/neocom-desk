/**
 * Caps the Overview's value-by-ore-type chart at a fixed number of bars so the
 * card holds its height however many ore types were mined. Everything past
 * the cap folds into one summed "Other" entry; the table under the chart
 * still lists every type, so nothing is lost.
 */
export interface RankedType {
  typeId: number;
  typeName: string;
  rawValue: number;
  refineValue: number;
}

export interface OtherTypes {
  rawValue: number;
  refineValue: number;
  /** The folded types, largest first — the chart's tooltip lists them. */
  types: RankedType[];
}

export interface TopTypes<T extends RankedType> {
  top: T[];
  other: OtherTypes | null;
}

/** `raw` when only raw value is shown; `both` ranks by raw + refined. */
export type RankBy = 'raw' | 'both';

function rankValue(point: RankedType, by: RankBy): number {
  return by === 'raw' ? point.rawValue : point.rawValue + point.refineValue;
}

export function topTypesWithOther<T extends RankedType>(
  types: readonly T[],
  { limit, by }: { limit: number; by: RankBy }
): TopTypes<T> {
  const sorted = [...types].sort((a, b) => rankValue(b, by) - rankValue(a, by));
  // An "Other" bar standing in for one type hides a name to save no space.
  if (sorted.length <= limit + 1) return { top: sorted, other: null };
  const folded = sorted.slice(limit);
  return {
    top: sorted.slice(0, limit),
    other: {
      rawValue: folded.reduce((sum, point) => sum + point.rawValue, 0),
      refineValue: folded.reduce((sum, point) => sum + point.refineValue, 0),
      types: folded,
    },
  };
}
