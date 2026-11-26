import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core';

export const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  const rectHits = rectIntersection(args);
  return rectHits.length > 0 ? rectHits : closestCorners(args);
};

export const DROP_INTO_CLASS = 'bg-accent/10 outline-2 -outline-offset-2 outline-accent-dim';
export const DROP_OUT_CLASS = 'outline-2 -outline-offset-2 outline-dashed outline-line-bright';
