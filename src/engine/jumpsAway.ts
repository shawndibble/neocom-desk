/**
 * Jumps-away display state for a station/structure row on the Assets page
 * (issue #87): a pure mapping from a route's waypoint list to a jump count
 * (origin and destination both included as stops).
 *
 * The count comes from the local stargate graph under the pilot's jump basis
 * (`features/route/jumpBasis.ts`), the same as every other jump count in the app.
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
