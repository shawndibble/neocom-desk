/**
 * A system's cost index history as the daily job publishes it to R2
 * (`cost-indices/<systemId>.json`), and the pure read of it the trend popover
 * draws. No fetch here: `costIndexHistoryRead.ts` owns the network.
 */
import type { IndustryActivity } from '@/engine/industry/types';

export interface CostIndexHistory {
  systemId: number;
  lastSyncedAt: number;
  /** ISO dates, ascending. */
  dates: string[];
  /** ESI activity name -> fraction per date (0.044 = 4.4%), null where unknown. */
  activities: Record<string, Array<number | null>>;
}

export interface CostIndexTrend {
  points: Array<{ date: string; value: number }>;
  weekAgo: number;
  today: number;
}

/** Fewer days than this and a trend says nothing. */
export const MIN_TREND_DAYS = 7;
const DAY_MS = 86_400_000;

/** The Build Plan's activity as ESI's `/industry/systems` names it. */
export function esiActivityName(activity: IndustryActivity): string {
  return activity === 'reaction' ? 'reaction' : 'manufacturing';
}

/** The object as the daily job writes it, or `null` when it is not that shape. */
export function parseCostIndexHistory(raw: unknown): CostIndexHistory | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { systemId, lastSyncedAt, dates, activities } = raw as Record<string, unknown>;
  if (typeof systemId !== 'number' || typeof lastSyncedAt !== 'number') return null;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (typeof activities !== 'object' || activities === null) return null;
  for (const series of Object.values(activities)) {
    if (!Array.isArray(series) || series.length !== dates.length) return null;
    if (!series.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)))) {
      return null;
    }
  }
  return {
    systemId,
    lastSyncedAt,
    dates,
    activities: activities as CostIndexHistory['activities'],
  };
}

/**
 * The activity's known days, plus the figure a week before the latest one (the
 * newest day at or before it, else the oldest). `null` under `MIN_TREND_DAYS`
 * known days, or when the object has no such activity.
 */
export function costIndexTrend(history: CostIndexHistory, activity: string): CostIndexTrend | null {
  const series = history.activities[activity];
  if (!series) return null;
  const points: CostIndexTrend['points'] = [];
  series.forEach((value, i) => {
    const date = history.dates[i];
    if (value !== null && date !== undefined) points.push({ date, value });
  });
  if (points.length < MIN_TREND_DAYS) return null;
  const last = points[points.length - 1]!;
  const cutoff = Date.parse(last.date) - 7 * DAY_MS;
  const before = points.filter((p) => Date.parse(p.date) <= cutoff);
  const weekAgo = (before.length > 0 ? before[before.length - 1]! : points[0]!).value;
  return { points, weekAgo, today: last.value };
}
