/**
 * A Thera / Turnur route with more jumps than the gates is never flown
 * (decision `20261012-224645`). Hubs are free to a biased search, so it can
 * price a long hole route below a short gate one; such a route is traded for
 * the one without holes. Route Safety and every jump count apply this same
 * rule, so a count always matches the route Route Safety draws.
 *
 * Pure.
 */
import {
  findJumpRoute,
  jumpDistancesFrom,
  routeSweepFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
} from './jumpRoute';
import { HUB_SYSTEM_IDS } from './theraConnections';

const HUB_IDS: ReadonlySet<number> = new Set(Object.values(HUB_SYSTEM_IDS));

/** The same search with every hole and bridge taken away: the preference and Avoided Systems stay. */
export function gatesOnlyOptions(options: FindJumpRouteOptions): FindJumpRouteOptions {
  return { ...options, extraConnections: undefined, freeSystems: undefined };
}

/** The same search without the holes: the bridges, preference and Avoided Systems stay. */
export function noHoleOptions(options: FindJumpRouteOptions): FindJumpRouteOptions {
  return {
    ...options,
    extraConnections: options.extraConnections?.filter(
      ([a, b]) => !HUB_IDS.has(a) && !HUB_IDS.has(b)
    ),
    freeSystems: undefined,
  };
}

/** A route that steps into or out of a hub by something other than a gate: a hole jump. */
export function crossesHole(graph: JumpGraph, systems: readonly number[]): boolean {
  return systems.some(
    (id, index) =>
      index > 0 &&
      (HUB_IDS.has(id) || HUB_IDS.has(systems[index - 1])) &&
      !graph.get(systems[index - 1])?.includes(id)
  );
}

/** More jumps than the gate route. With no gate route at all, nothing is longer. */
export function longerThanGates(systems: readonly number[], gates: JumpRouteResult): boolean {
  return gates.kind === 'route' && systems.length > gates.systems.length;
}

/** `findJumpRoute`, with a hole route longer than the gates traded for the route without holes. */
export function findFlownRoute(
  graph: JumpGraph,
  from: number,
  to: number,
  options: FindJumpRouteOptions = {}
): JumpRouteResult {
  const route = findJumpRoute(graph, from, to, options);
  if (route.kind !== 'route' || !crossesHole(graph, route.systems)) return route;
  const gates = findJumpRoute(graph, from, to, gatesOnlyOptions(options));
  return longerThanGates(route.systems, gates)
    ? findJumpRoute(graph, from, to, noHoleOptions(options))
    : route;
}

/**
 * `jumpDistancesFrom`, each system counted as `findFlownRoute` flies it. With
 * no hole open it is the one sweep; with holes, up to three.
 */
export function flownJumpDistancesFrom(
  graph: JumpGraph,
  originSystemId: number,
  options: FindJumpRouteOptions = {}
): ReadonlyMap<number, number> {
  if (!options.freeSystems?.size) return jumpDistancesFrom(graph, originSystemId, options);
  const sweep = routeSweepFrom(graph, originSystemId, options);
  const gates = jumpDistancesFrom(graph, originSystemId, gatesOnlyOptions(options));
  let noHoles: ReadonlyMap<number, number> | null = null;
  const jumps = new Map(sweep.jumps);
  for (const [systemId, count] of sweep.jumps) {
    const gateCount = gates.get(systemId);
    if (gateCount === undefined || count <= gateCount) continue;
    const route = sweep.routeTo(systemId);
    if (route === null || !crossesHole(graph, route)) continue;
    noHoles ??= jumpDistancesFrom(graph, originSystemId, noHoleOptions(options));
    const fallback = noHoles.get(systemId);
    if (fallback === undefined) jumps.delete(systemId);
    else jumps.set(systemId, fallback);
  }
  return jumps;
}
