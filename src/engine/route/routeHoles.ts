/**
 * Route Safety through the open Thera / Turnur holes (issue #2476): which of
 * EVE-Scout's connections a route may use, and the extra connections and free
 * systems the pathfinder is handed for them.
 *
 * Pure. `jumpRoute.ts` knows nothing about hubs — this is where a hole list
 * becomes plain graph edges. The costing rule (decision on routing through
 * Thera and Turnur): the hole jumps and the hub itself carry no security
 * cost; the entrance and exit systems are charged as any other system.
 */
import type { JumpGraph } from './jumpRoute';
import {
  HUB_SYSTEM_IDS,
  shipSizeRank,
  type TheraConnection,
  type TheraHub,
  type WormholeShipSize,
} from './theraConnections';

/** Which hubs' holes a route may use. */
export type RouteHoleHubs = TheraHub | 'all';

export interface RouteHoleSettings {
  hubs: RouteHoleHubs;
  /** The pilot's ship: only holes passing this size or bigger are used. */
  shipSize: WormholeShipSize;
  /** Holes with less life than this left are skipped. */
  minLifeHours: number;
}

const HOUR_MS = 3_600_000;

/** The connections a route may cross: the chosen hubs, the ship's size, enough life left. */
export function routeHoles<T extends TheraConnection>(
  connections: readonly T[],
  settings: RouteHoleSettings,
  now: number
): T[] {
  const minSize = shipSizeRank(settings.shipSize);
  const minLifeMs = Math.max(0, settings.minLifeHours) * HOUR_MS;
  return connections.filter((connection) => {
    if (settings.hubs !== 'all' && connection.hub !== settings.hubs) return false;
    if (connection.maxShipSize === null || shipSizeRank(connection.maxShipSize) < minSize) {
      return false;
    }
    const remainingMs = connection.expiresAt - now;
    return remainingMs > 0 && remainingMs >= minLifeMs;
  });
}

export interface HoleNetwork {
  extraConnections: [number, number][];
  freeSystems: Set<number>;
}

/**
 * The pathfinder's view of the holes: one connection from each exit to its
 * hub, and the hubs those holes lead to as free systems. A hub with no usable
 * hole is not freed, so with none at all the gate route is exactly as before.
 */
export function holeNetwork(holes: readonly HoleEnds[]): HoleNetwork {
  const extraConnections: [number, number][] = [];
  const freeSystems = new Set<number>();
  for (const hole of holes) {
    const hubId = HUB_SYSTEM_IDS[hole.hub];
    extraConnections.push([hole.exitSystemId, hubId]);
    freeSystems.add(hubId);
  }
  return { extraConnections, freeSystems };
}

/** What the pathfinder sees of a hole: which exit it joins to which hub. */
export type HoleEnds = Pick<TheraConnection, 'exitSystemId' | 'hub'>;

/**
 * A stable name for the network a hole list makes — sorted, each exit/hub
 * pair once. The list itself is rebuilt as life ticks down; a route only
 * needs planning again when this changes.
 */
export function holeNetworkKey(holes: readonly HoleEnds[]): string {
  return [...new Set(holes.map((hole) => `${hole.exitSystemId}:${hole.hub}`))].sort().join(',');
}

/** The network `holeNetworkKey` named, rebuilt from the name alone. */
export function holeNetworkFromKey(key: string): HoleNetwork {
  if (key === '') return holeNetwork([]);
  const ends = key.split(',').flatMap((pair): HoleEnds[] => {
    const [exit, hub] = pair.split(':');
    return hub === 'thera' || hub === 'turnur' ? [{ exitSystemId: Number(exit), hub }] : [];
  });
  return holeNetwork(ends);
}

/**
 * The hole a step between two systems crosses, either way round, or `null`
 * for a step no hole joins. Several holes can join the same exit to the same
 * hub; the longest-lived one is the one worth flying.
 */
export function holeBetween<T extends TheraConnection>(
  holes: readonly T[],
  from: number,
  to: number
): T | null {
  let best: T | null = null;
  for (const hole of holes) {
    const hubId = HUB_SYSTEM_IDS[hole.hub];
    const joins =
      (hole.exitSystemId === from && hubId === to) || (hole.exitSystemId === to && hubId === from);
    if (joins && (best === null || hole.expiresAt > best.expiresAt)) best = hole;
  }
  return best;
}

/** The hole a step between two systems crosses, or `null` for a stargate jump. */
export type HoleAt<T extends TheraConnection = TheraConnection> = (
  from: number,
  to: number
) => T | null;

/**
 * One answer to "was this step a hole?" for everything that draws a route: a
 * hole joins the two systems and no stargate does. Where both join them (an
 * exit next door to Turnur) the gate is the jump shown, as Set waypoints
 * reads it too: the pilot can always fly the gate. The search may have
 * priced that step as the free hole, a difference of at most one system's
 * security cost on a pairing EVE-Scout rarely lists.
 */
export function holeStepFinder<T extends TheraConnection>(
  graph: JumpGraph,
  holes: readonly T[]
): HoleAt<T> {
  if (holes.length === 0) return () => null;
  return (from, to) => (graph.get(from)?.includes(to) ? null : holeBetween(holes, from, to));
}

/** The positions along a route entered through a hole: index `i` is the step from `i - 1`. */
export function holeStepIndexes(systemIds: readonly number[], holeAt: HoleAt): number[] {
  const indexes: number[] = [];
  for (let index = 1; index < systemIds.length; index += 1) {
    if (holeAt(systemIds[index - 1], systemIds[index])) indexes.push(index);
  }
  return indexes;
}
