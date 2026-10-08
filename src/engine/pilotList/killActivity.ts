/**
 * What a pilot's kills say about where and how recently they fight (Pilot
 * Lookup's Local list). Pure: the kill list is fetched in
 * `src/lib/zkillboard.ts`; here it is only counted and dated.
 */
export type KillSpace = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const KILL_SPACES: readonly KillSpace[] = ['highsec', 'lowsec', 'nullsec', 'wormhole'];

/** How far back the per-space counts reach. */
export const ACTIVITY_WINDOW_DAYS = 30;

/** How many months the modal's chart spans. */
export const CHART_MONTHS = 6;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** One kill the pilot took part in. `space` is null when zKillboard didn't say. */
export interface KillRecord {
  timeMs: number;
  space: KillSpace | null;
  systemId: number | null;
  /** The hull that died. */
  victimShipTypeId: number | null;
  /** The hull this pilot flew on the kill. */
  ownShipTypeId: number | null;
}

export interface SpaceActivity {
  /** Kills inside the window. */
  count: number;
  /** The newest kill in this space, in any age; null when there is none. */
  lastMs: number | null;
}

export interface KillSummary {
  bySpace: Record<KillSpace, SpaceActivity>;
  /** Kills inside the window, whatever the space. */
  recentCount: number;
}

export function summarizeKills(kills: readonly KillRecord[], nowMs: number): KillSummary {
  const bySpace = Object.fromEntries(
    KILL_SPACES.map((space) => [space, { count: 0, lastMs: null }])
  ) as Record<KillSpace, SpaceActivity>;
  const since = nowMs - ACTIVITY_WINDOW_DAYS * DAY_MS;
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

/** How loudly a kill's age is drawn: today, this week, older, or no kill. */
export type AgeTone = 'fresh' | 'week' | 'old' | 'none';

export function ageTone(lastMs: number | null, nowMs: number): AgeTone {
  if (lastMs === null) return 'none';
  const age = nowMs - lastMs;
  if (age < DAY_MS) return 'fresh';
  if (age < 7 * DAY_MS) return 'week';
  return 'old';
}

export interface MonthBucket extends Record<KillSpace, number> {
  /** `YYYY-MM`, UTC. */
  key: string;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `CHART_MONTHS` UTC months, oldest first, with kills counted by space. */
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

/** The most common hulls in a list of type ids, most first; unknowns are skipped. */
export function topShips(ids: readonly (number | null)[], limit: number): ShipCount[] {
  const counts = new Map<number, number>();
  for (const id of ids) if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([shipTypeId, count]) => ({ shipTypeId, count }))
    .sort((a, b) => b.count - a.count || a.shipTypeId - b.shipTypeId)
    .slice(0, limit);
}
