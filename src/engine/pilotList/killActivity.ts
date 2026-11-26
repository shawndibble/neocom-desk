import { DAY_MS } from '@/lib/age';
export type KillSpace = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const KILL_SPACES: readonly KillSpace[] = ['highsec', 'lowsec', 'nullsec', 'wormhole'];

export const ACTIVITY_WINDOW_DAYS = 30;

export const CHART_MONTHS = 6;

export interface KillRecord {
  timeMs: number;
  space: KillSpace | null;
  systemId: number | null;
  victimShipTypeId: number | null;
  ownShipTypeId: number | null;
  attackerCount?: number | null;
}

export interface SpaceActivity {
  count: number;
  lastMs: number | null;
}

export interface KillSummary {
  bySpace: Record<KillSpace, SpaceActivity>;
  recentCount: number;
}

export function windowStart(nowMs: number): number {
  return nowMs - ACTIVITY_WINDOW_DAYS * DAY_MS;
}

export function summarizeKills(kills: readonly KillRecord[], nowMs: number): KillSummary {
  const bySpace = Object.fromEntries(
    KILL_SPACES.map((space) => [space, { count: 0, lastMs: null }])
  ) as Record<KillSpace, SpaceActivity>;
  const since = windowStart(nowMs);
  let recentCount = 0;
  for (const kill of kills) {
    const recent = kill.timeMs >= since;
    if (recent) recentCount += 1;
    if (kill.space === null) continue;
    const entry = bySpace[kill.space];
    if (recent) entry.count += 1;
    if (entry.lastMs === null || kill.timeMs > entry.lastMs) entry.lastMs = kill.timeMs;
  }
  return { bySpace, recentCount };
}

export const LAST_KILL_SHOWN_DAYS = 183;

export function shownLastKill(lastMs: number | null, nowMs: number): number | null {
  if (lastMs === null) return null;
  return nowMs - lastMs > LAST_KILL_SHOWN_DAYS * DAY_MS ? null : lastMs;
}

export type AgeTone = 'fresh' | 'week' | 'old' | 'none';

export function ageTone(lastMs: number | null, nowMs: number): AgeTone {
  if (lastMs === null) return 'none';
  const age = nowMs - lastMs;
  if (age < DAY_MS) return 'fresh';
  if (age < 7 * DAY_MS) return 'week';
  return 'old';
}

export interface MonthBucket extends Record<KillSpace, number> {
  key: string;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthlyBySpace(kills: readonly KillRecord[], nowMs: number): MonthBucket[] {
  const now = new Date(nowMs);
  const buckets: MonthBucket[] = [];
  for (let back = CHART_MONTHS - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    buckets.push({ key: monthKey(date), highsec: 0, lowsec: 0, nullsec: 0, wormhole: 0 });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const kill of kills) {
    if (kill.space === null) continue;
    const bucket = byKey.get(monthKey(new Date(kill.timeMs)));
    if (bucket) bucket[kill.space] += 1;
  }
  return buckets;
}

export interface ShipCount {
  shipTypeId: number;
  count: number;
}

export function topShips(ids: readonly (number | null)[], limit: number): ShipCount[] {
  const counts = new Map<number, number>();
  for (const id of ids) if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([shipTypeId, count]) => ({ shipTypeId, count }))
    .sort((a, b) => b.count - a.count || a.shipTypeId - b.shipTypeId)
    .slice(0, limit);
}
