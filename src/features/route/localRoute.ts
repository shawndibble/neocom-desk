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
import { jumpsAwayFromRoute, type JumpsAwayResult } from '@/engine/jumpsAway';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemIndex } from '@/sde/solarSystems';

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
  const [graph, systems] = await Promise.all([loadJumpGraph(), loadSolarSystemIndex()]);
  if (!graph) return { kind: 'unknown' };
  return findJumpRoute(graph, originSystemId, destinationSystemId, {
    preference,
    securityOf: systems ? (systemId) => systems.get(systemId)?.security : undefined,
  });
}

/**
 * The same answer as a jump count, in the shape the Assets page's tooltip
 * already speaks (`engine/jumpsAway.ts`) — so a caller that only wants a
 * number can take this and ignore the systems crossed.
 *
 * Both `no-route` and `unknown` arrive here as `noRoute`, which is correct
 * for a *count*: neither is a distance. A caller that needs to tell a
 * wormhole apart from an unreadable snapshot must use `findLocalRoute`.
 */
export async function findLocalJumps(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreferenceKind = 'shortest'
): Promise<JumpsAwayResult> {
  const route = await findLocalRoute(originSystemId, destinationSystemId, preference);
  return jumpsAwayFromRoute(route.kind === 'route' ? route.systems : null);
}
