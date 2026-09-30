/**
 * Route Safety's row model (issue #2328): every system on a stargate route,
 * joined to its security, region, and the last hour of traffic and kills ESI
 * publishes for the whole universe in one call each.
 *
 * States conditions, never verdicts (decision `20260912-172628`): a row says
 * "12 ship kills in the last hour", and nothing here scores a system or a
 * route as safe or not. That call is the pilot's.
 *
 * Unknown is kept apart from zero, the same split `localRoute.ts` keeps
 * between "no route" and "could not read the graph":
 * - ESI lists only systems that had activity, so a system missing from a
 *   response that *did* arrive had none — zero.
 * - A feed that could not be fetched at all is unknown for every system.
 * - Both feeds exclude wormhole space, so a J-space system is always unknown.
 *
 * Pure, per CLAUDE.md: the caller supplies every lookup.
 */
import { isGankChokepoint, chokepointsOnRoute } from '@/engine/route/chokepoints';
import { securityBand, shownSecurity, type SecurityBand } from '@/engine/securityStatus';

/** `GET /universe/system_kills/`'s row shape. */
export interface SystemKillsEntry {
  system_id: number;
  ship_kills: number;
  pod_kills: number;
  npc_kills: number;
}

/** `GET /universe/system_jumps/`'s row shape. */
export interface SystemJumpsEntry {
  system_id: number;
  ship_jumps: number;
}

export interface SystemKills {
  shipKills: number;
  podKills: number;
  npcKills: number;
}

export interface RouteSafetySystemEntry {
  id: number;
  name: string;
  security: number;
  regionId: number;
}

export interface RouteSafetyInputs {
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
  /** `null` when the feed could not be read at all. */
  kills: ReadonlyMap<number, SystemKills> | null;
  /** `null` when the feed could not be read at all. */
  jumps: ReadonlyMap<number, number> | null;
}

export interface RouteSafetyRow {
  systemId: number;
  /** `null` for a system the snapshot does not know. */
  name: string | null;
  /** Rounded to one decimal, as the game shows it. */
  security: number | null;
  band: SecurityBand | null;
  regionId: number | null;
  regionName: string | null;
  /** Each `null` is unknown, never zero. */
  jumps: number | null;
  shipKills: number | null;
  podKills: number | null;
  npcKills: number | null;
  chokepoint: boolean;
}

export interface RouteSafetySummary {
  jumps: number;
  highsec: number;
  lowsec: number;
  nullsec: number;
  lowestSecurity: number | null;
  /** `null` when any system on the route is unknown: a partial total would read low. */
  shipKills: number | null;
  podKills: number | null;
  /** Named, in the order they are flown. */
  chokepoints: string[];
}

const WORMHOLE_SYSTEM_MIN = 31_000_000;
const WORMHOLE_SYSTEM_MAX = 31_999_999;

function isWormholeSystem(systemId: number): boolean {
  return systemId >= WORMHOLE_SYSTEM_MIN && systemId <= WORMHOLE_SYSTEM_MAX;
}

export function indexSystemKills(raw: readonly SystemKillsEntry[]): Map<number, SystemKills> {
  return new Map(
    raw.map((entry) => [
      entry.system_id,
      { shipKills: entry.ship_kills, podKills: entry.pod_kills, npcKills: entry.npc_kills },
    ])
  );
}

export function indexSystemJumps(raw: readonly SystemJumpsEntry[]): Map<number, number> {
  return new Map(raw.map((entry) => [entry.system_id, entry.ship_jumps]));
}

const NO_KILLS: SystemKills = { shipKills: 0, podKills: 0, npcKills: 0 };

export function buildRouteSafetyRows(
  route: readonly number[],
  { systems, regionNames, kills, jumps }: RouteSafetyInputs
): RouteSafetyRow[] {
  return route.map((systemId) => {
    const entry = systems.get(systemId);
    const outsideFeeds = isWormholeSystem(systemId);
    const systemKills = kills === null || outsideFeeds ? null : (kills.get(systemId) ?? NO_KILLS);
    return {
      systemId,
      name: entry?.name ?? null,
      security: entry ? shownSecurity(entry.security) : null,
      band: entry ? securityBand(entry.security) : null,
      regionId: entry?.regionId ?? null,
      regionName: entry ? (regionNames.get(entry.regionId) ?? null) : null,
      jumps: jumps === null || outsideFeeds ? null : (jumps.get(systemId) ?? 0),
      shipKills: systemKills?.shipKills ?? null,
      podKills: systemKills?.podKills ?? null,
      npcKills: systemKills?.npcKills ?? null,
      chokepoint: isGankChokepoint(systemId),
    };
  });
}

function totalOf(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function summarizeRouteSafety(rows: readonly RouteSafetyRow[]): RouteSafetySummary {
  const securities = rows.flatMap((row) => (row.security === null ? [] : [row.security]));
  return {
    jumps: Math.max(0, rows.length - 1),
    highsec: rows.filter((row) => row.band === 'highsec').length,
    lowsec: rows.filter((row) => row.band === 'lowsec').length,
    nullsec: rows.filter((row) => row.band === 'nullsec').length,
    lowestSecurity: securities.length === 0 ? null : Math.min(...securities),
    shipKills: totalOf(rows.map((row) => row.shipKills)),
    podKills: totalOf(rows.map((row) => row.podKills)),
    chokepoints: chokepointsOnRoute(rows.map((row) => row.systemId)),
  };
}
