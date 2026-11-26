import { crossesHole, findFlownRoute, flownJumpDistancesFrom } from '@/engine/route/holeDetour';
import {
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
  type RoutePreferenceKind,
  routeSweepFrom,
} from '@/engine/route/jumpRoute';
import { jumpCountsForRoutes, type RouteEnds } from '@/engine/route/jumpCounts';
import { planHaul, type HaulInput, type HaulPlan } from '@/engine/route/haulPlan';
import { planTrip, type TripOptions, type TripPlan } from '@/engine/route/tripPlan';
import { loadJumpGraph } from '@/sde/jumpGraph';
import type { RouteRules } from './routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export type LocalRouteRules = Partial<RouteRules>;

export type RouteGraphExtras = Pick<FindJumpRouteOptions, 'extraConnections' | 'freeSystems'>;

function engineOptions(
  rules: LocalRouteRules,
  securityOf: ((systemId: number) => number | undefined) | undefined,
  extras: RouteGraphExtras = {}
): FindJumpRouteOptions {
  return {
    preference: rules.preference ?? 'shortest',
    securityPenalty: rules.securityPenalty,
    securityOf,
    avoid: new Set(rules.avoid ?? []),
    extraConnections: extras.extraConnections,
    freeSystems: extras.freeSystems,
  };
}

export type LocalRouteResult = JumpRouteResult | { kind: 'unknown' };

async function securityLookupFor(
  preference: RoutePreferenceKind
): Promise<((systemId: number) => number | undefined) | undefined> {
  if (preference === 'shortest') return undefined;
  const systems = await loadSolarSystemsById();
  return systems ? (systemId) => systems.get(systemId)?.security : undefined;
}

function loadSearchContext(rules: LocalRouteRules) {
  return Promise.all([loadJumpGraph(), securityLookupFor(rules.preference ?? 'shortest')]);
}

export async function findLocalRoute(
  originSystemId: number,
  destinationSystemId: number,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalRouteResult> {
  const [graph, securityOf] = await loadSearchContext(rules);
  if (!graph) return { kind: 'unknown' };
  return findFlownRoute(
    graph,
    originSystemId,
    destinationSystemId,
    engineOptions(rules, securityOf, extras)
  );
}

export type LocalJumpsResult =
  { kind: 'known'; jumps: number } | { kind: 'no-route' } | { kind: 'unknown' };

export async function findLocalJumps(
  originSystemId: number,
  destinationSystemId: number,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalJumpsResult> {
  const route = await findLocalRoute(originSystemId, destinationSystemId, rules, extras);
  return route.kind === 'route' ? { kind: 'known', jumps: route.systems.length - 1 } : route;
}

export type LocalJumpDistances =
  { kind: 'known'; jumps: ReadonlyMap<number, number> } | { kind: 'unknown' };

export async function localJumpDistances(
  originSystemId: number,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalJumpDistances> {
  const [graph, securityOf] = await loadSearchContext(rules);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'known',
    jumps: flownJumpDistancesFrom(graph, originSystemId, engineOptions(rules, securityOf, extras)),
  };
}

export type LocalRoutesFromOrigin =
  { kind: 'known'; routes: ReadonlyMap<number, number[] | null> } | { kind: 'unknown' };

export async function localRoutesFromOrigin(
  originSystemId: number,
  systemIds: readonly number[],
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalRoutesFromOrigin> {
  const [graph, securityOf] = await Promise.all([
    loadJumpGraph(),
    securityLookupFor(rules.preference ?? 'shortest'),
  ]);
  if (!graph) return { kind: 'unknown' };
  const options = engineOptions(rules, securityOf, extras);
  const sweep = routeSweepFrom(graph, originSystemId, options);
  const holes = Boolean(options.freeSystems?.size);
  const routes = new Map<number, number[] | null>();
  for (const systemId of systemIds) {
    let outbound = sweep.routeTo(systemId);
    if (outbound && holes && crossesHole(graph, outbound)) {
      const flown = findFlownRoute(graph, originSystemId, systemId, options);
      outbound = flown.kind === 'route' ? flown.systems : null;
    }
    routes.set(systemId, outbound ? [...outbound].reverse() : null);
  }
  return { kind: 'known', routes };
}

export type LocalJumpCounts =
  { kind: 'known'; counts: readonly (number | null)[] } | { kind: 'unknown' };

export async function localJumpCountsForRoutes(
  routes: readonly RouteEnds[],
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalJumpCounts> {
  const [graph, securityOf] = await loadSearchContext(rules);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'known',
    counts: jumpCountsForRoutes(graph, routes, engineOptions(rules, securityOf, extras)),
  };
}

export type LocalTripResult =
  | { kind: 'trip'; plan: TripPlan; graph: JumpGraph; options: FindJumpRouteOptions }
  | { kind: 'unknown' };

export async function planLocalTrip(
  start: number,
  stops: readonly number[],
  rules: LocalRouteRules = {},
  tripOptions: TripOptions = {},
  extras: RouteGraphExtras = {}
): Promise<LocalTripResult> {
  const [graph, securityOf] = await loadSearchContext(rules);
  if (!graph) return { kind: 'unknown' };
  const options = engineOptions(rules, securityOf, extras);
  return {
    kind: 'trip',
    plan: planTrip(graph, start, stops, options, tripOptions),
    graph,
    options,
  };
}

export async function planLocalHaul(
  input: Omit<HaulInput, 'graph' | 'options'>,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<{ kind: 'haul'; plan: HaulPlan } | { kind: 'unknown' }> {
  const [graph, securityOf] = await loadSearchContext(rules);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'haul',
    plan: planHaul({ ...input, graph, options: engineOptions(rules, securityOf, extras) }),
  };
}
