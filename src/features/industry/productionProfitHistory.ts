/**
 * Reduces Production Log entries into a day-bucketed, cumulative
 * realized-profit series for the Records tab's profit-over-time chart
 * (issue #711). Cumulative running total, not a per-day figure: production
 * runs are lumpy and infrequent (unlike the wallet's near-continuous
 * balance), so a per-bucket value would mostly show gaps and spikes — the
 * running total is what answers "is this character's production trending
 * more or less profitable over time," the same question the tab's own
 * total-realized-profit hero already answers for the whole filtered range
 * (see docs/context/decisions/20260906-091110-industry-page-reads-verdict-first.md).
 */
import { formatLocalDate } from '@/lib/localDate';

export interface ProductionProfitEntry {
  loggedAt: number;
  profit: number;
}

export interface ProductionProfitPoint {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Cumulative realized profit through this day, inclusive. */
  profit: number;
}

export function productionProfitHistory(
  entries: readonly ProductionProfitEntry[]
): ProductionProfitPoint[] {
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    const day = formatLocalDate(new Date(entry.loggedAt));
    byDate.set(day, (byDate.get(day) ?? 0) + entry.profit);
  }

  let running = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayProfit]) => {
      running += dayProfit;
      return { date, profit: running };
    });
}

export type ProductionProfitTrend = 'up' | 'down' | 'flat';

/** First point vs. last point — the line's overall direction, for trend-coloring the chart. */
export function productionProfitTrend(
  points: readonly ProductionProfitPoint[]
): ProductionProfitTrend {
  if (points.length < 2) return 'flat';
  const delta = points[points.length - 1].profit - points[0].profit;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}
