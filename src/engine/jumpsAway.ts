/**
 * Jumps-away display state for a station/structure row on the Assets page
 * (issue #87): a pure mapping from a resolved ESI route to a jump count. ESI's
 * `/route/` resolves server-side (CONTEXT.md round 14), so this never needs a
 * local pathfinding graph — it only interprets the waypoint list `/route/`
 * already returns (origin and destination both included as stops).
 *
 * The "no location"/"no route" distinction the Assets page shows in its
 * tooltip is assembled by the caller, not here: this module only knows how to
 * turn a route into a jump count, not why one might be missing.
 *
 * `noRoute` is deliberately the catch-all for every way a distance can fail
 * to resolve once the character's own location IS known — ESI genuinely
 * found no route, the destination's own solar system couldn't be resolved
 * (offline, or an ACL-denied structure), or the call errored. The tooltip
 * only needs to distinguish "we don't know where you are" from "we couldn't
 * work out how far this station is"; a three-way split the ticket never
 * asked for would need a third ESI-error-shaped reason with no UI use.
 */

export type JumpsAwayReason = 'noLocation' | 'noRoute';

export type JumpsAwayResult =
  { kind: 'known'; jumps: number } | { kind: 'unknown'; reason: JumpsAwayReason };

/**
 * `route` is ESI's system-id waypoint list (including both ends); null means
 * it could not be resolved. An empty array is treated the same way — ESI's
 * `/route/` always includes at least the origin system, so `[]` is not a
 * real "0 jumps" answer, just another shape of "unresolved".
 */
export function jumpsAwayFromRoute(route: readonly number[] | null): JumpsAwayResult {
  if (route === null || route.length === 0) return { kind: 'unknown', reason: 'noRoute' };
  return { kind: 'known', jumps: route.length - 1 };
}
