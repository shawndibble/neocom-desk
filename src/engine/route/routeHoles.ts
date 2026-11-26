import {
  HUB_SYSTEM_IDS,
  shipSizeRank,
  type TheraConnection,
  type TheraHub,
  type WormholeShipSize,
} from './theraConnections';
import { HOUR_MS } from '@/lib/age';

export type RouteHoleHubs = TheraHub | 'all';

export interface RouteHoleSettings {
  hubs: RouteHoleHubs;
  shipSize: WormholeShipSize;
  minLifeHours: number;
}

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

export type HoleEnds = Pick<TheraConnection, 'exitSystemId' | 'hub'>;

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
