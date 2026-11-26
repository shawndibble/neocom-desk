import type { IndustryActivity } from '@/engine/industry/types';
import { DAY_MS } from '@/lib/age';

export interface CostIndexHistory {
  systemId: number;
  lastSyncedAt: number;
  dates: string[];
  activities: Record<string, Array<number | null>>;
}

export interface CostIndexTrend {
  points: Array<{ date: string; value: number }>;
  weekAgo: number;
  today: number;
}

export const MIN_TREND_DAYS = 7;
const TREND_WINDOW_DAYS = 7;
const MAX_TREND_DAYS = 90;
export function esiActivityName(activity: IndustryActivity): 'manufacturing' | 'reaction' {
  return activity === 'reaction' ? 'reaction' : 'manufacturing';
}

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

export function costIndexTrend(history: CostIndexHistory, activity: string): CostIndexTrend | null {
  const series = history.activities[activity];
  if (!series) return null;
  const points: CostIndexTrend['points'] = [];
  series.forEach((value, i) => {
    const date = history.dates[i];
    if (value !== null && date !== undefined) points.push({ date, value });
  });
  if (points.length < MIN_TREND_DAYS) return null;
  points.splice(0, Math.max(0, points.length - MAX_TREND_DAYS));
  const last = points[points.length - 1]!;
  const cutoff = Date.parse(last.date) - TREND_WINDOW_DAYS * DAY_MS;
  const before = points.filter((p) => Date.parse(p.date) <= cutoff);
  const weekAgo = (before.length > 0 ? before[before.length - 1]! : points[0]!).value;
  return { points, weekAgo, today: last.value };
}
