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

export function gatesOnlyOptions(options: FindJumpRouteOptions): FindJumpRouteOptions {
  return { ...options, extraConnections: undefined, freeSystems: undefined };
}

export function noHoleOptions(options: FindJumpRouteOptions): FindJumpRouteOptions {
  return {
    ...options,
    extraConnections: options.extraConnections?.filter(
      ([a, b]) => !HUB_IDS.has(a) && !HUB_IDS.has(b)
    ),
    freeSystems: undefined,
  };
}

export function crossesHole(graph: JumpGraph, systems: readonly number[]): boolean {
  return systems.some(
    (id, index) =>
      index > 0 &&
      (HUB_IDS.has(id) || HUB_IDS.has(systems[index - 1])) &&
      !graph.get(systems[index - 1])?.includes(id)
  );
}

export function longerThanGates(systems: readonly number[], gates: JumpRouteResult): boolean {
  return gates.kind === 'route' && systems.length > gates.systems.length;
}

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
