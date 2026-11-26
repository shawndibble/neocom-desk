import { isGankChokepoint, chokepointsOnRoute } from '@/engine/route/chokepoints';
import { securityBand, shownSecurity, type SecurityBand } from '@/engine/securityStatus';

export interface SystemKillsEntry {
  system_id: number;
  ship_kills: number;
  pod_kills: number;
  npc_kills: number;
}

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
  kills: ReadonlyMap<number, SystemKills> | null;
  jumps: ReadonlyMap<number, number> | null;
  lawless?: ReadonlySet<number>;
}

export interface RouteSafetyRow {
  systemId: number;
  name: string | null;
  security: number | null;
  band: SecurityBand | null;
  regionId: number | null;
  regionName: string | null;
  jumps: number | null;
  shipKills: number | null;
  podKills: number | null;
  npcKills: number | null;
  chokepoint: boolean;
  lawless?: boolean;
}

export interface RouteSafetySummary {
  jumps: number;
  highsec: number;
  lowsec: number;
  nullsec: number;
  lowestSecurity: number | null;
  shipKills: number | null;
  podKills: number | null;
  chokepoints: string[];
}

const WORMHOLE_SYSTEM_MIN = 31_000_000;
const WORMHOLE_SYSTEM_MAX = 31_999_999;

export function isWormholeSystem(systemId: number): boolean {
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
  { systems, regionNames, kills, jumps, lawless }: RouteSafetyInputs
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
      ...(lawless?.has(systemId) ? { lawless: true } : {}),
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

function kspaceSecurities(rows: readonly RouteSafetyRow[]): number[] {
  return rows.flatMap((row) =>
    row.security === null || isWormholeSystem(row.systemId) ? [] : [row.security]
  );
}

export function summarizeRouteSafety(rows: readonly RouteSafetyRow[]): RouteSafetySummary {
  const securities = kspaceSecurities(rows);
  const kspace = rows.filter((row) => !isWormholeSystem(row.systemId));
  return {
    jumps: Math.max(0, rows.length - 1),
    highsec: kspace.filter((row) => row.band === 'highsec').length,
    lowsec: kspace.filter((row) => row.band === 'lowsec').length,
    nullsec: kspace.filter((row) => row.band === 'nullsec').length,
    lowestSecurity: securities.length === 0 ? null : Math.min(...securities),
    shipKills: totalOf(rows.map((row) => row.shipKills)),
    podKills: totalOf(rows.map((row) => row.podKills)),
    chokepoints: chokepointsOnRoute(rows.map((row) => row.systemId)),
  };
}

export interface JoinedLegs<R extends RouteSafetyRow = RouteSafetyRow> {
  rows: R[];
  stopIndexes: number[];
}

export function joinLegs<R extends RouteSafetyRow>(legs: readonly (readonly R[])[]): JoinedLegs<R> {
  const rows: R[] = [];
  const stopIndexes: number[] = [];
  legs.forEach((leg, index) => {
    rows.push(...(index === 0 ? leg : leg.slice(1)));
    stopIndexes.push(rows.length - 1);
  });
  return { rows, stopIndexes };
}

export function summarizeTrip(legs: readonly (readonly RouteSafetyRow[])[]): RouteSafetySummary {
  const { rows } = joinLegs(legs);
  const distinct = [...new Map(rows.map((row) => [row.systemId, row])).values()];
  const distinctSummary = summarizeRouteSafety(distinct);
  return {
    ...summarizeRouteSafety(rows),
    shipKills: distinctSummary.shipKills,
    podKills: distinctSummary.podKills,
    chokepoints: distinctSummary.chokepoints,
  };
}

export const MIN_QUIET_RUN = 2;

export type RouteStretch =
  | { kind: 'system'; row: RouteSafetyRow }
  | {
      kind: 'quiet';
      rows: RouteSafetyRow[];
      lowestSecurity: number;
    };

function isQuiet(row: RouteSafetyRow, zkillCount: (systemId: number) => number | null): boolean {
  return (
    !isWormholeSystem(row.systemId) &&
    !row.chokepoint &&
    row.security !== null &&
    row.shipKills === 0 &&
    row.podKills === 0 &&
    zkillCount(row.systemId) === 0
  );
}

export function foldQuietStretches(
  rows: readonly RouteSafetyRow[],
  zkillCount: (systemId: number) => number | null,
  pinned: ReadonlySet<number> = new Set()
): RouteStretch[] {
  const stretches: RouteStretch[] = [];
  let run: RouteSafetyRow[] = [];
  const flush = () => {
    if (run.length >= MIN_QUIET_RUN) {
      const lowestSecurity = Math.min(...run.map((r) => r.security ?? Infinity));
      stretches.push({ kind: 'quiet', rows: run, lowestSecurity });
    } else {
      for (const r of run) stretches.push({ kind: 'system', row: r });
    }
    run = [];
  };
  rows.forEach((row, index) => {
    const middle = index > 0 && index < rows.length - 1;
    if (middle && !pinned.has(row.systemId) && isQuiet(row, zkillCount)) {
      run.push(row);
      return;
    }
    flush();
    stretches.push({ kind: 'system', row });
  });
  flush();
  return stretches;
}

export function routeStripKeySystems(
  rows: readonly RouteSafetyRow[],
  stopIndexes: readonly number[] = []
): number[] {
  const keys = new Set<number>(stopIndexes.filter((index) => index < rows.length));
  if (rows.length > 0) keys.add(0);
  if (rows.length > 1) keys.add(rows.length - 1);
  const securities = kspaceSecurities(rows);
  if (securities.length > 0) {
    const lowest = Math.min(...securities);
    keys.add(rows.findIndex((row) => row.security === lowest && !isWormholeSystem(row.systemId)));
  }
  rows.forEach((row, index) => {
    if (row.chokepoint) keys.add(index);
  });
  return [...keys].sort((a, b) => a - b);
}
