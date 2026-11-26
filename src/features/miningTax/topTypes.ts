export interface RankedType {
  typeId: number;
  typeName: string;
  rawValue: number;
  refineValue: number;
}

export interface OtherTypes {
  rawValue: number;
  refineValue: number;
  types: RankedType[];
}

export interface TopTypes<T extends RankedType> {
  top: T[];
  other: OtherTypes | null;
}

export type RankBy = 'raw' | 'both';

function rankValue(point: RankedType, by: RankBy): number {
  return by === 'raw' ? point.rawValue : point.rawValue + point.refineValue;
}

export function topTypesWithOther<T extends RankedType>(
  types: readonly T[],
  { limit, by }: { limit: number; by: RankBy }
): TopTypes<T> {
  const sorted = [...types].sort((a, b) => rankValue(b, by) - rankValue(a, by));
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

export interface ValueRanked {
  typeId: number;
  typeName: string;
  value: number;
}

export interface OtherValues {
  value: number;
  types: ValueRanked[];
}

export interface TopValues<T extends ValueRanked> {
  top: T[];
  other: OtherValues | null;
}

export function topValuesWithOther<T extends ValueRanked>(
  types: readonly T[],
  { limit }: { limit: number }
): TopValues<T> {
  const sorted = [...types].sort((a, b) => b.value - a.value);
  if (sorted.length <= limit + 1) return { top: sorted, other: null };
  const folded = sorted.slice(limit);
  return {
    top: sorted.slice(0, limit),
    other: {
      value: folded.reduce((sum, point) => sum + point.value, 0),
      types: folded,
    },
  };
}
