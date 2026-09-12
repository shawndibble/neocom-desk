/**
 * Route distances from the local stargate graph (issue #942) — the
 * request-free sibling of `features/character/routeDistance.ts`, which asks
 * ESI's `/route/` and therefore costs one request per pair.
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
  type JumpRouteResult,
  type RoutePreferenceKind,
} from '@/engine/route/jumpRoute';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';

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
  preference: RoutePreferenceKind = 'shortest'
): Promise<LocalRouteResult> {
  const [graph, securityOf] = await Promise.all([loadJumpGraph(), securityLookupFor(preference)]);
  if (!graph) return { kind: 'unknown' };
  return findJumpRoute(graph, originSystemId, destinationSystemId, { preference, securityOf });
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
  preference: RoutePreferenceKind = 'shortest'
): Promise<LocalJumpsResult> {
  const route = await findLocalRoute(originSystemId, destinationSystemId, preference);
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
  preference: RoutePreferenceKind = 'shortest'
): Promise<LocalJumpDistances> {
  const [graph, securityOf] = await Promise.all([loadJumpGraph(), securityLookupFor(preference)]);
  if (!graph) return { kind: 'unknown' };
  return {
    kind: 'known',
    jumps: jumpDistancesFrom(graph, originSystemId, { preference, securityOf }),
  };
}
