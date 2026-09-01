/**
 * Price-history reduction: sorts ESI's daily market-history rows into
 * chronological order for the chart. Pure — callers adapt the ESI response
 * shape at the boundary. ESI documents no ordering guarantee for
 * `/markets/{region_id}/history`.
 */

export interface MarketHistoryPoint {
  date: string;
  average: number;
  volume: number;
}

/** Sorts by date ascending, oldest first — the order the chart draws left to right. */
export function sortPriceHistory(points: readonly MarketHistoryPoint[]): MarketHistoryPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}
