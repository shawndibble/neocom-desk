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
export const FIT_FLOOR = 0.25;
const FOCUS_ZOOM = 0.8;
const FIT_PADDING = 40;

const clampZoom = (z: number, scale: number) =>
  Math.min(MAX_ZOOM * scale, Math.max(MIN_ZOOM * scale, z));

function centreAt(world: Size, viewport: Size, z: number, leftInset: number): Camera {
  const width = viewport.width - leftInset;
  return {
    z,
    x: leftInset + (width - world.width * z) / 2,
    y: (viewport.height - world.height * z) / 2,
  };
}

export function fitCamera(world: Size, viewport: Size, leftInset = 0, scale = 1): Camera {
  const width = viewport.width - leftInset;
  const z = Math.max(
    FIT_FLOOR * scale,
    Math.min(
      scale,
      (width - FIT_PADDING) / world.width,
      (viewport.height - FIT_PADDING) / world.height
    )
  );
  return centreAt(world, viewport, z, leftInset);
}

export function initialCamera(world: Size, viewport: Size, leftInset = 0, scale = 1): Camera {
  return centreAt(world, viewport, scale, leftInset);
}

export function focusCamera(
  node: ShipTreeNode,
  viewport: Size,
  currentZoom: number,
  scale = 1,
  rightInset = 0
): Camera {
  const z = Math.max(currentZoom, FOCUS_ZOOM * scale);
  return {
    z,
    x: (viewport.width - rightInset) / 2 - (node.x + node.w / 2) * z,
    y: viewport.height / 2 - (node.y + node.h / 2) * z,
  };
}

export function zoomAround(cam: Camera, factor: number, px: number, py: number, scale = 1): Camera {
  const z = clampZoom(cam.z * factor, scale);
  return { z, x: px - ((px - cam.x) * z) / cam.z, y: py - ((py - cam.y) * z) / cam.z };
}

const WHEEL_SENSITIVITY = 0.002;

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_SENSITIVITY);
}
