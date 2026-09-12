/**
 * Route distances from the local stargate graph (issue #942) — the
 * request-free sibling of `features/character/routeDistance.ts`, which asks
 * ESI's `/route/` and therefore costs one request per pair.
 *
 * This is what makes a distance affordable across a whole table: both
 * snapshots are local files indexed once per session, so resolving fifty rows
 * costs no requests at all and never touches the shared error budget. The ESI
 * resolver stays exactly as it is — the Assets page is deliberately untouched
 * by this ticket.
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
  type JumpRouteResult,
  type RoutePreferenceKind,
} from '@/engine/route/jumpRoute';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';

/** A route, a definite absence of one, or an admission that we cannot tell. */
export type LocalRouteResult = JumpRouteResult | { kind: 'unknown' };

/**
 * The stargate route between two solar systems under one preference.
 *
 * Never throws and never rejects: an unreadable snapshot answers `unknown`,
 * which is the same contract `lookupSolarSystem` and `lookupNpcStation`
 * already follow. A missing *systems* snapshot is not fatal on its own — the
 * search degrades to shortest-path, since a preference with no security to
 * read is only a longer way of counting jumps — but a missing *graph* is,
 * because there is nothing to search.
 */
export async function findLocalRoute(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreferenceKind = 'shortest'
): Promise<LocalRouteResult> {
  const [graph, systems] = await Promise.all([loadJumpGraph(), loadSolarSystemsById()]);
  if (!graph) return { kind: 'unknown' };
  return findJumpRoute(graph, originSystemId, destinationSystemId, {
    preference,
    securityOf: systems ? (systemId) => systems.get(systemId)?.security : undefined,
  });
}

/** A jump count, or which of the two reasons there isn't one. */
export type LocalJumpsResult =
  { kind: 'known'; jumps: number } | { kind: 'no-route' } | { kind: 'unknown' };

/**
 * `findLocalRoute` for a caller that wants the number and not the systems
 * crossed.
 *
 * Deliberately *not* `engine/jumpsAway.ts`'s `JumpsAwayResult`: its two
 * reasons are the Assets page's own, and neither can say "a snapshot could
 * not be read". Reusing it would fold `unknown` into `no-route` at exactly
 * the API a sortable column consumes, so an offline first visit would report
 * "no gate route exists" for every haul in the game.
 */
export async function findLocalJumps(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreferenceKind = 'shortest'
): Promise<LocalJumpsResult> {
  const route = await findLocalRoute(originSystemId, destinationSystemId, preference);
  return route.kind === 'route' ? { kind: 'known', jumps: route.systems.length - 1 } : route;
}
