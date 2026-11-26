import {
  findLocalRoute,
  type LocalRouteRules,
  type RouteGraphExtras,
} from '@/features/route/localRoute';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { shownSecurity } from '@/engine/securityStatus';
import { chokepointsOnRoute, isGankChokepoint } from '@/engine/route/chokepoints';

export interface RouteSystem {
  systemId: number;
  name: string | null;
  security: number | null;
  chokepoint: boolean;
}

const EXPOSED_AT_OR_BELOW = 0.5;

export type RouteExposure =
  | {
      kind: 'known';
      exposedSystems: number;
      totalSystems: number;
      chokepoints: string[];
      path: RouteSystem[];
    }
  | { kind: 'no-route' }
  | { kind: 'unknown' };

export async function routeExposure(
  originSystemId: number | null,
  destinationSystemId: number | null,
  rules: LocalRouteRules,
  extras: RouteGraphExtras = {}
): Promise<RouteExposure> {
  if (originSystemId === null || destinationSystemId === null) return { kind: 'unknown' };

  const [route, systems] = await Promise.all([
    findLocalRoute(originSystemId, destinationSystemId, rules, extras),
    loadSolarSystemsById(),
  ]);
  if (route.kind === 'no-route') return { kind: 'no-route' };
  if (route.kind === 'unknown' || !systems) return { kind: 'unknown' };

  let exposedSystems = 0;
  const path: RouteSystem[] = [];
  for (const systemId of route.systems) {
    const entry = systems.get(systemId);
    const security = entry?.security;
    path.push({
      systemId,
      name: entry?.name ?? null,
      security: security ?? null,
      chokepoint: isGankChokepoint(systemId),
    });
    if (security !== undefined && shownSecurity(security) <= EXPOSED_AT_OR_BELOW) {
      exposedSystems += 1;
    }
  }
  return {
    kind: 'known',
    exposedSystems,
    totalSystems: route.systems.length,
    chokepoints: chokepointsOnRoute(route.systems),
    path,
  };
}
