export const TREND_MAX_SERIES = 6;

export interface TrendSeriesRef {
  typeId: number;
  hubId: string | null;
  key: string;
}

export interface TrendPlan {
  refs: TrendSeriesRef[];
  omitted: number;
}

export function planTrendSeries(
  typeIds: readonly number[],
  hubIds: readonly string[],
  isGlobal: (typeId: number) => boolean
): TrendPlan {
  const items = [...new Set(typeIds)];
  const hubs = [...new Set(hubIds)];
  const all: TrendSeriesRef[] = [];
  if (hubs.length > 0) {
    for (const typeId of items) {
      if (isGlobal(typeId)) {
        all.push({ typeId, hubId: null, key: `${typeId}@global` });
        continue;
      }
      for (const hubId of hubs) all.push({ typeId, hubId, key: `${typeId}@${hubId}` });
    }
  }
  return {
    refs: all.slice(0, TREND_MAX_SERIES),
    omitted: Math.max(0, all.length - TREND_MAX_SERIES),
  };
}
