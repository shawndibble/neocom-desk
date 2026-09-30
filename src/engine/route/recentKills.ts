/**
 * Route Safety's zKillboard column (issue #2329): one route system's player
 * kills from the last hour, grouped by where in the system they happened, with
 * a tag when the attackers brought warp disruption bubbles or smartbombs.
 *
 * States conditions, never verdicts (decision `20260912-172628`): "3 kills at
 * Stargate (Nourvukaiken), last one 32 min ago, smartbombs involved". Nothing
 * here decides what those kills mean for the pilot.
 *
 * Pure, per CLAUDE.md: the caller parses the killmails, resolves location
 * names and supplies the type → group lookup.
 */
import type { SecurityBand } from '@/engine/securityStatus';

/*
 * Group ids verified against the SDE (`public/data/types.json`): Sabre, Eris,
 * Heretic and Flycatcher sit in 541; Onyx, Broadsword, Devoter and Phobos in
 * 894; every Smartbomb module (125 types, T1/T2/compact/faction/officer) in 72.
 */
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
}

/** One player kill, as `lib/zkillboard.ts` parses it (NPC kills already dropped). */
export interface RecentKill {
  killmailId: number;
  /** Epoch milliseconds. */
  time: number;
  /** zKillboard's nearest celestial, stargate or station; `null` when absent. */
  locationId: number | null;
  attackers: readonly RecentKillAttacker[];
}

/** What a location id resolved to. A location that resolved to nothing is simply absent. */
export type ResolvedLocation =
  | { kind: 'stargate'; name: string; destinationSystemId: number }
  | { kind: 'station'; name: string };

export interface KillTags {
  /** An Interdictor or Heavy Interdiction Cruiser was on the mail, in nullsec. */
  bubble: boolean;
  /** An attacker's weapon was a smartbomb. */
  smartbomb: boolean;
}

export interface KillTagContext {
  groupOf: (typeId: number) => number | undefined;
  /** The system's band; `null` when unknown, which never tags a bubble. */
  band: SecurityBand | null;
}

/**
 * Bubbles can only be launched in nullsec, so a dictor on a highsec or lowsec
 * mail says nothing about a bubble and is not tagged.
 */
export function classifyKillTags(kill: RecentKill, { groupOf, band }: KillTagContext): KillTags {
  const groupOfOptional = (typeId: number | undefined) =>
    typeId === undefined ? undefined : groupOf(typeId);
  const bubble =
    band === 'nullsec' &&
    kill.attackers.some((attacker) => {
      const group = groupOfOptional(attacker.shipTypeId);
      return group !== undefined && BUBBLE_HULL_GROUPS.has(group);
    });
  const smartbomb = kill.attackers.some(
    (attacker) => groupOfOptional(attacker.weaponTypeId) === SMART_BOMB_GROUP_ID
  );
  return { bubble, smartbomb };
}

export interface RecentKillLocation extends KillTags {
  /** The location id as a string, or `'other'` for the pooled unnamed group. */
  key: string;
  kind: 'stargate' | 'station' | 'other';
  /** `null` for the unnamed group: a planet, moon, belt, structure or no location. */
  name: string | null;
  /** A stargate leading to the previous or next system on the route. */
  onPath: boolean;
  count: number;
  minutesSinceLast: number;
}

export interface RecentKillsSummary extends KillTags {
  count: number;
  /** `null` when nothing died. */
  minutesSinceLast: number | null;
  /** Busiest first; ties go to the most recent. */
  locations: RecentKillLocation[];
}

export interface RecentKillsContext extends KillTagContext {
  locations: ReadonlyMap<number, ResolvedLocation>;
  /** The route systems either side of this one. */
  pathNeighbours: ReadonlySet<number>;
  /** Epoch milliseconds. */
  now: number;
}

const OTHER_KEY = 'other';

function minutesBefore(now: number, time: number): number {
  return Math.max(0, Math.floor((now - time) / 60_000));
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
        bubble: false,
        smartbomb: false,
        latest: kill.time,
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.latest = Math.max(group.latest, kill.time);
    group.bubble ||= tags.bubble;
    group.smartbomb ||= tags.smartbomb;
  }

  const locations = [...groups.values()]
    .sort((a, b) => b.count - a.count || b.latest - a.latest)
    .map(({ latest: groupLatest, ...group }) => ({
      ...group,
      minutesSinceLast: minutesBefore(context.now, groupLatest),
    }));

  return {
    count: kills.length,
    minutesSinceLast: latest === null ? null : minutesBefore(context.now, latest),
    bubble,
    smartbomb,
    locations,
  };
}
