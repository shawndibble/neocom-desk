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

/** The whole tree, centred, at most 100%. */
/** `rightInset`: px an overlay panel covers on the right, left out of the fit. */
export function fitCamera(world: Size, viewport: Size, rightInset = 0): Camera {
  const width = viewport.width - rightInset;
  const z = Math.max(
    FIT_FLOOR,
    Math.min(1, (width - FIT_PADDING) / world.width, (viewport.height - FIT_PADDING) / world.height)
  );
  return {
    z,
    x: (width - world.width * z) / 2,
    y: (viewport.height - world.height * z) / 2,
  };
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

/** One classic mouse-wheel notch, in pixels, zooms by the old fixed 12% step. */
const WHEEL_NOTCH_PX = 100;
const WHEEL_NOTCH_FACTOR = 1.12;
/** `WheelEvent.deltaMode` line and page units, in pixels (Firefox sends 3 lines a notch). */
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 800;
/** One event never moves more than this, however large its delta. */
const WHEEL_MAX_PX = 300;

/**
 * The zoom factor for one wheel event: proportional to its vertical delta,
 * so a trackpad's or a pinch's stream of small deltas zooms smoothly and a
 * mouse notch still steps ~12%. No vertical delta (a sideways swipe,
 * shift+wheel) is no zoom.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (deltaY === 0) return 1;
  const unit = deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  const px = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, deltaY * unit));
  return Math.exp((-px * Math.log(WHEEL_NOTCH_FACTOR)) / WHEEL_NOTCH_PX);
}
