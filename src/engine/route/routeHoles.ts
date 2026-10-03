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
import {
  HUB_SYSTEM_IDS,
  shipSizeRank,
  type TheraConnection,
  type TheraHub,
  type WormholeShipSize,
} from './theraConnections';

export interface RouteHoleSettings {
  hubs: TheraHub | 'all';
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
