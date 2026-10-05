/**
 * Route distances from the local stargate graph (issue #942) — what every
 * jump count in the app runs on (`jumpBasis.ts`), with no ESI `/route/`
 * request, so it costs nothing per pair and never touches the shared error
 * budget.
 *
 * This is what makes a distance affordable across a whole table: both
 * snapshots are local files indexed once per session, so resolving a page of
 * rows costs no requests at all and never touches the shared error budget.
 *
 * Three outcomes, and keeping them apart is the point:
 * - a route, with the systems it crosses;
 * - `no-route`, a fact about New Eden (wormhole space has no stargates, and
 *   some ids genuinely do not connect);
 * - `unknown`, meaning a snapshot could not be read and this app cannot say.
 *
 * Collapsing the last two would let an offline first visit report "no gate
 * route exists" for every haul in the game.
 */
import {
  findJumpRoute,
  jumpDistancesFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
  type RoutePreferenceKind,
} from '@/engine/route/jumpRoute';
import { jumpCountsForRoutes, type RouteEnds } from '@/engine/route/jumpCounts';
import { planTrip, type TripOptions, type TripPlan } from '@/engine/route/tripPlan';
import { loadJumpGraph } from '@/sde/jumpGraph';
import type { RouteRules } from './routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';

/**
 * What a route is asked under: the Travel Settings, or a page's own preference
 * over them. Every entry point takes these explicitly rather than reading the
 * settings here: callers compute inside effects keyed on their inputs, and
 * rules read behind their back would never re-run them when they change.
 */
export type LocalRouteRules = Partial<RouteRules>;

/**
 * Connections beyond the stargates, and the systems they make free — the open
 * Thera / Turnur holes (issue #2476) and known Ansiblex bridges, as
 * `useJumpBasis` builds them from the pilot's Route Safety settings. Every
 * count passes the same ones, so every count matches the route Route Safety
 * draws.
 */
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

/**
 * A security lookup for the pathfinder, or `undefined` where there is nothing
 * to bias on.
 *
 * `shortest` never consults security, so it does not pay for `systems.json`
 * (~98 KB gzipped) at all; a biased preference that cannot read the snapshot
 * degrades to shortest rather than pretending to a safety judgement it has no
 * data for.
 */
async function securityLookupFor(
  preference: RoutePreferenceKind
): Promise<((systemId: number) => number | undefined) | undefined> {
  if (preference === 'shortest') return undefined;
  const systems = await loadSolarSystemsById();
  return systems ? (systemId) => systems.get(systemId)?.security : undefined;
}

/**
 * The stargate route between two solar systems under one preference.
 *
 * Never throws and never rejects: an unreadable graph answers `unknown`, the
 * same contract `lookupSolarSystem` and `lookupNpcStation` already follow.
 *
 * For many destinations from one origin, reach for `localJumpDistances`
 * instead — one sweep answers all of them for about what two of these cost.
 */
export async function findLocalRoute(
  originSystemId: number,
  destinationSystemId: number,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalRouteResult> {
  const [graph, securityOf] = await Promise.all([
    loadJumpGraph(),
    securityLookupFor(rules.preference ?? 'shortest'),
  ]);
  if (!graph) return { kind: 'unknown' };
  return findJumpRoute(
    graph,
    originSystemId,
    destinationSystemId,
    engineOptions(rules, securityOf, extras)
  );
}

/** A jump count, or which of the two reasons there isn't one. */
export type LocalJumpsResult =
  { kind: 'known'; jumps: number } | { kind: 'no-route' } | { kind: 'unknown' };

/**
 * Deliberately not `engine/jumpsAway.ts`'s `JumpsAwayResult`: its two reasons
 * are the Assets page's own, and neither can say "a snapshot could not be
 * read".
 */
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

/**
 * Jumps from one origin to every system it can reach, in one pass — the shape
 * a table ranking hauls by distance should use.
 *
 * A system absent from the map is unreachable by stargate. The result is
 * wrapped rather than returned bare because an empty map from an unreadable
 * snapshot would otherwise be indistinguishable from an origin that reaches
 * nothing, and those are the two meanings this module exists to keep apart.
 */
export async function localJumpDistances(
  originSystemId: number,
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalJumpDistances> {
  const [graph, securityOf] = await Promise.all([
    loadJumpGraph(),
    securityLookupFor(rules.preference ?? 'shortest'),
  ]);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'known',
    jumps: jumpDistancesFrom(graph, originSystemId, engineOptions(rules, securityOf, extras)),
  };
}

export type LocalJumpCounts =
  { kind: 'known'; counts: readonly (number | null)[] } | { kind: 'unknown' };

/**
 * Jumps for a whole table of routes in one pass — the shape a board ranking
 * hauls by distance wants, and the only one that does not scale with row
 * count.
 *
 * A `null` count is a haul with no distance to give: an end in a player
 * structure this app cannot place, or two ends no stargate connects. That is
 * per row. `unknown` is the whole answer being unavailable because the graph
 * could not be read — a board shows the first as an unavailable cell and the
 * second as a column that cannot be ranked at all.
 */
export async function localJumpCountsForRoutes(
  routes: readonly RouteEnds[],
  rules: LocalRouteRules = {},
  extras: RouteGraphExtras = {}
): Promise<LocalJumpCounts> {
  const [graph, securityOf] = await Promise.all([
    loadJumpGraph(),
    securityLookupFor(rules.preference ?? 'shortest'),
  ]);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'known',
    counts: jumpCountsForRoutes(graph, routes, engineOptions(rules, securityOf, extras)),
  };
}

/**
 * `graph` is the stargate map the trip was planned on, for telling a gate step
 * from a hole; `options` the search it was planned under, holes and all, for
 * weighing a leg's other ways the same way (`engine/route/legWays.ts`).
 */
export type LocalTripResult =
  | { kind: 'trip'; plan: TripPlan; graph: JumpGraph; options: FindJumpRouteOptions }
  | { kind: 'unknown' };

/**
 * A trip from `start` through several Stops (issue #2475): every leg, and the
 * cheapest stop order when asked, all under the same rules a single route is
 * drawn with — the graph and security lookup load once for the whole trip.
 */
export async function planLocalTrip(
  start: number,
  stops: readonly number[],
  rules: LocalRouteRules = {},
  tripOptions: TripOptions = {},
  extras: RouteGraphExtras = {}
): Promise<LocalTripResult> {
  const [graph, securityOf] = await Promise.all([
    loadJumpGraph(),
    securityLookupFor(rules.preference ?? 'shortest'),
  ]);
  if (!graph) return { kind: 'unknown' };
  const options = engineOptions(rules, securityOf, extras);
  return {
    kind: 'trip',
    plan: planTrip(graph, start, stops, options, tripOptions),
    graph,
    options,
  };
}
