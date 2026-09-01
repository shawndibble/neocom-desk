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
 */

export type JumpsAwayReason = 'noLocation' | 'noRoute';

export type JumpsAwayResult =
  { kind: 'known'; jumps: number } | { kind: 'unknown'; reason: JumpsAwayReason };

/** `route` is ESI's system-id waypoint list (including both ends); null means it could not be resolved. */
export function jumpsAwayFromRoute(route: readonly number[] | null): JumpsAwayResult {
  if (route === null) return { kind: 'unknown', reason: 'noRoute' };
  return { kind: 'known', jumps: Math.max(0, route.length - 1) };
}
