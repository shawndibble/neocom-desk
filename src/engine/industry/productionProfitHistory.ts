import { formatLocalDate } from '@/lib/localDate';

export interface ProductionProfitEntry {
  loggedAt: number;
  profit: number;
}

export interface ProductionProfitPoint {
  date: string;
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

export function productionProfitTrend(
  points: readonly ProductionProfitPoint[]
): ProductionProfitTrend {
  if (points.length < 2) return 'flat';
  const delta = points[points.length - 1].profit - points[0].profit;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}
