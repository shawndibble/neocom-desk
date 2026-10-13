/**
 * How much of a haul's route is flown at 0.5 security or below (issue #946).
 *
 * The documented ganking contract runs a short route through lowsec or a 0.5
 * system, so the count of such systems along the way is one of the conditions
 * that makes the shape visible as a shape. Endpoint bands (#939) cannot answer
 * it: a highsec pickup and a highsec delivery can still route through lowsec,
 * which is exactly the thing the board otherwise refuses to claim either way.
 *
 * Computed for **one** contract, when its detail is opened — never per row. A
 * path per row is the ESI-shaped fan-out the local snapshots exist to avoid,
 * and it is real work even locally; one route on demand is free by comparison,
 * and the detail is where a hauler is deciding.
 *
 * 0.5 is counted rather than only lowsec, because 0.5 is where the documented
 * ganking happens: CONCORD responds slowest there, so it is the cheapest
 * highsec system in the game to be killed in.
 */
import {
  findLocalRoute,
  type LocalRouteRules,
  type RouteGraphExtras,
} from '@/features/route/localRoute';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { shownSecurity } from '@/engine/securityStatus';
import { chokepointsOnRoute, isGankChokepoint } from '@/engine/route/chokepoints';

/**
 * One system on the route, as the jump list in the detail prints it.
 * A system the snapshot does not hold keeps its place with no name or
 * security rather than dropping out: a list one short of the jump count above
 * it reads as a different route.
 */
export interface RouteSystem {
  systemId: number;
  name: string | null;
  security: number | null;
  chokepoint: boolean;
}

/** Security at or below which a system is counted. 0.5 rounds to 0.5 and is included. */
const EXPOSED_AT_OR_BELOW = 0.5;

export type RouteExposure =
  | {
      kind: 'known';
      exposedSystems: number;
      totalSystems: number;
      /** Named gank chokepoints on the way, in the order they are flown. */
      chokepoints: string[];
      /** Every system crossed, in flown order, both ends included. */
      path: RouteSystem[];
    }
  /** There is no gate route at all — a fact about New Eden, not a gap in the data. */
  | { kind: 'no-route' }
  /** A snapshot could not be read, so nothing is concluded. */
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
    // A system the snapshot does not hold is not counted as exposed: an
    // unknown security is not a low one, and guessing would inflate a figure
    // the hauler is about to weigh.
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
