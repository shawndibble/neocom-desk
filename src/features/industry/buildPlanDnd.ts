import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';

/**
 * Hand-composed, because `closestCenter` — what both existing dnd lists use —
 * is wrong for dropping *into* a container (#627). It scores by distance
 * between droppable centres, so a ~28px group header sitting among ~40px plan
 * rows loses to its neighbours from most pointer positions the pilot would
 * call "on the header".
 *
 * The order is dnd-kit's own recommendation for multi-container lists:
 *
 * 1. `pointerWithin` — the pointer is literally inside a droppable. Exact, and
 *    the answer whenever the pilot is aiming at a specific row.
 * 2. `rectIntersection` — nothing under the pointer, but the dragged rect
 *    overlaps something. Covers a drag whose pointer has run past the list
 *    edge while the row is still over it.
 * 3. `closestCorners` — nothing overlaps either. Also the *first* usable step
 *    for any drag with no pointer coordinates at all, which is why the chain
 *    exists rather than `pointerWithin` alone.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  const rectHits = rectIntersection(args);
  return rectHits.length > 0 ? rectHits : closestCorners(args);
};

/** A drop that lands the plan *in* a group: accent, the app's "this is the live target" colour. */
export const DROP_INTO_CLASS = 'bg-accent/10 outline-2 -outline-offset-2 outline-accent-dim';
/**
 * A drop that takes the plan *out* of every group. Deliberately not the accent
 * treatment: leaving is the absence of a destination, and drawing it as one
 * more would lose the only distinction `groupDrop.ts` works to keep — a plain
 * dashed hairline reads as "no group" rather than as another group.
 */
export const DROP_OUT_CLASS = 'outline-2 -outline-offset-2 outline-dashed outline-line-bright';
