import type { SecurityBand } from '@/engine/securityStatus';
import { MINUTE_MS } from '@/lib/age';

export const INTERDICTOR_GROUP_ID = 541;
export const HEAVY_INTERDICTION_CRUISER_GROUP_ID = 894;
export const SMART_BOMB_GROUP_ID = 72;

const BUBBLE_HULL_GROUPS: ReadonlySet<number> = new Set([
  INTERDICTOR_GROUP_ID,
  HEAVY_INTERDICTION_CRUISER_GROUP_ID,
]);

export interface RecentKillAttacker {
  shipTypeId?: number;
  weaponTypeId?: number;
  characterId?: number;
  corporationId?: number;
  allianceId?: number;
  finalBlow?: boolean;
}

export interface RecentKillVictim {
  characterId: number | null;
  corporationId: number | null;
  allianceId: number | null;
  shipTypeId: number | null;
}

export interface RecentKill {
  killmailId: number;
  time: number;
  locationId: number | null;
  attackers: readonly RecentKillAttacker[];
  victim?: RecentKillVictim;
  value?: number | null;
}

export type ResolvedLocation =
  | { kind: 'stargate'; name: string; destinationSystemId: number }
  | { kind: 'station'; name: string };

export interface KillTags {
  bubble: boolean;
  smartbomb: boolean;
}

export interface KillTagContext {
  groupOf: (typeId: number) => number | undefined;
  band: SecurityBand | null;
}

export function classifyKillTags(kill: RecentKill, { groupOf, band }: KillTagContext): KillTags {
  const groupOfAttackerType = (typeId: number | undefined) =>
    typeId === undefined ? undefined : groupOf(typeId);
  const bubble =
    band === 'nullsec' &&
    kill.attackers.some((attacker) => {
      const group = groupOfAttackerType(attacker.shipTypeId);
      return group !== undefined && BUBBLE_HULL_GROUPS.has(group);
    });
  const smartbomb = kill.attackers.some(
    (attacker) => groupOfAttackerType(attacker.weaponTypeId) === SMART_BOMB_GROUP_ID
  );
  return { bubble, smartbomb };
}

export interface RecentKillView extends RecentKill, KillTags {}

export const SHIP_AND_POD_WINDOW_MS = 5 * MINUTE_MS;

export function groupVictimKills<T extends RecentKill>(kills: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const kill of kills) {
    const pilot = kill.victim?.characterId ?? null;
    const group =
      pilot === null
        ? undefined
        : groups.find(
            (candidate) =>
              candidate[0]?.victim?.characterId === pilot &&
              Math.abs(candidate[0].time - kill.time) <= SHIP_AND_POD_WINDOW_MS
          );
    if (group) group.unshift(kill);
    else groups.push([kill]);
  }
  return groups;
}

export interface HullKillCount {
  groupId: number;
  kills: number;
}

export function hullClassKillCounts(
  kills: readonly RecentKill[],
  groupOf: (typeId: number) => number | undefined
): HullKillCount[] {
  const counts = new Map<number, number>();
  for (const kill of kills) {
    const groups = new Set<number>();
    for (const attacker of kill.attackers) {
      if (attacker.shipTypeId === undefined) continue;
      const group = groupOf(attacker.shipTypeId);
      if (group !== undefined) groups.add(group);
    }
    for (const group of groups) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts]
    .map(([groupId, kills]) => ({ groupId, kills }))
    .sort((a, b) => b.kills - a.kills || a.groupId - b.groupId);
}

export function capAttackers<T extends RecentKillAttacker>(
  attackers: readonly T[],
  max: number
): { shown: T[]; more: number } {
  if (attackers.length <= max) return { shown: [...attackers], more: 0 };
  const shown = attackers.slice(0, max);
  const blow = attackers.findIndex((attacker) => attacker.finalBlow === true);
  if (blow >= max) shown[max - 1] = attackers[blow] as T;
  return { shown, more: attackers.length - max };
}

export interface RecentKillLocation extends KillTags {
  key: string;
  kind: 'stargate' | 'station' | 'other';
  name: string | null;
  onPath: boolean;
  count: number;
  minutesSinceLast: number;
  kills: RecentKillView[];
  hulls: HullKillCount[];
}

export interface RecentKillsSummary extends KillTags {
  count: number;
  minutesSinceLast: number | null;
  locations: RecentKillLocation[];
  hulls: HullKillCount[];
}

export interface RecentKillsContext extends KillTagContext {
  locations: ReadonlyMap<number, ResolvedLocation>;
  pathNeighbours: ReadonlySet<number>;
  now: number;
}

const OTHER_KEY = 'other';

export function minutesBefore(now: number, time: number): number {
  return Math.max(0, Math.floor((now - time) / MINUTE_MS));
}

export function summarizeRecentKills(
  kills: readonly RecentKill[],
  context: RecentKillsContext
): RecentKillsSummary {
  const groups = new Map<string, RecentKillLocation & { latest: number }>();
  let latest: number | null = null;
  let bubble = false;
  let smartbomb = false;

  for (const kill of kills) {
    const tags = classifyKillTags(kill, context);
    bubble ||= tags.bubble;
    smartbomb ||= tags.smartbomb;
    latest = latest === null ? kill.time : Math.max(latest, kill.time);

    const resolved = kill.locationId === null ? undefined : context.locations.get(kill.locationId);
    const key = resolved ? String(kill.locationId) : OTHER_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        kind: resolved?.kind ?? 'other',
        name: resolved?.name ?? null,
        onPath:
          resolved?.kind === 'stargate' && context.pathNeighbours.has(resolved.destinationSystemId),
        count: 0,
        minutesSinceLast: 0,
        kills: [],
        hulls: [],
        bubble: false,
        smartbomb: false,
        latest: kill.time,
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.kills.push({ ...kill, ...tags });
    group.latest = Math.max(group.latest, kill.time);
    group.bubble ||= tags.bubble;
    group.smartbomb ||= tags.smartbomb;
  }

  const locations = [...groups.values()]
    .sort((a, b) => b.count - a.count || b.latest - a.latest)
    .map(({ latest: groupLatest, ...group }) => {
      const newestFirst = [...group.kills].sort((a, b) => b.time - a.time);
      return {
        ...group,
        kills: newestFirst,
        hulls: hullClassKillCounts(newestFirst, context.groupOf),
        minutesSinceLast: minutesBefore(context.now, groupLatest),
      };
    });

  return {
    count: kills.length,
    minutesSinceLast: latest === null ? null : minutesBefore(context.now, latest),
    bubble,
    smartbomb,
    locations,
    hulls: hullClassKillCounts(kills, context.groupOf),
  };
}
