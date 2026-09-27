/**
 * The map's pan/zoom camera: world → screen is `translate(x, y) scale(z)`.
 * Pure, so Fit, centring on a hull and zooming around the pointer are
 * testable without a DOM.
 */
import type { ShipTreeNode } from '@/engine/shipTree/types';

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;
/** Fit never shrinks the tree below this — past it the tiles stop reading. */
export const FIT_FLOOR = 0.25;
/** Centring on a hull zooms in to at least this. */
const FOCUS_ZOOM = 0.8;
const FIT_PADDING = 40;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The tree centred at zoom `z`. `leftInset`: px an overlay panel covers on the left. */
function centreAt(world: Size, viewport: Size, z: number, leftInset: number): Camera {
  const width = viewport.width - leftInset;
  return {
    z,
    x: leftInset + (width - world.width * z) / 2,
    y: (viewport.height - world.height * z) / 2,
  };
}

/** The whole tree, centred, at most 100%. */
export function fitCamera(world: Size, viewport: Size, leftInset = 0): Camera {
  const width = viewport.width - leftInset;
  const z = Math.max(
    FIT_FLOOR,
    Math.min(1, (width - FIT_PADDING) / world.width, (viewport.height - FIT_PADDING) / world.height)
  );
  return centreAt(world, viewport, z, leftInset);
}

/**
 * The tree centred at its native size (100%), the default the map opens (and
 * resets to on a faction switch) at — unlike `fitCamera`, this never shrinks
 * a large tree to make it fit; the reader pans to see the rest.
 */
export function initialCamera(world: Size, viewport: Size, leftInset = 0): Camera {
  return centreAt(world, viewport, 1, leftInset);
}

/** One class centred in the viewport. */
export function focusCamera(node: ShipTreeNode, viewport: Size, currentZoom: number): Camera {
  const z = Math.max(currentZoom, FOCUS_ZOOM);
  return {
    z,
    x: viewport.width / 2 - (node.x + node.w / 2) * z,
    y: viewport.height / 2 - (node.y + node.h / 2) * z,
  };
}

/** Zoom by `factor`, keeping the world point under (px, py) — viewport coordinates — still. */
export function zoomAround(cam: Camera, factor: number, px: number, py: number): Camera {
  const z = clampZoom(cam.z * factor);
  return { z, x: px - ((px - cam.x) * z) / cam.z, y: py - ((py - cam.y) * z) / cam.z };
}

/** A wheel event's vertical delta zooms by this much per pixel. */
const WHEEL_SENSITIVITY = 0.002;

/**
 * The zoom factor for one wheel event's vertical delta: scrolling up (a
 * negative `deltaY`) zooms in. Deliberately simpler than the old
 * device-aware `wheelZoomFactor` this replaced (no `deltaMode`/notch
 * handling or per-event cap) — @use-gesture reports raw pixel deltas, and
 * the pan/pinch gestures already accept its plain, untuned feel.
 */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_SENSITIVITY);
}
