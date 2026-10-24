/**
 * Which price lines a Market Trend widget draws: its items crossed with its
 * hubs, capped so the chart stays legible. Pure: the caller says which items
 * are global-market (PLEX trades in one region whatever the hub).
 */

/** Most lines a Market Trend widget draws; the chart has six colours and six dash patterns. */
export const TREND_MAX_SERIES = 6;

export interface TrendSeriesRef {
  typeId: number;
  /** The Trade Hub it is priced at; null for a global-market item, read at its own region. */
  hubId: string | null;
  /** Stable across widgets, so two widgets sharing a line share one read. */
  key: string;
}

export interface TrendPlan {
  refs: TrendSeriesRef[];
  /** Lines past the cap, not drawn. */
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
