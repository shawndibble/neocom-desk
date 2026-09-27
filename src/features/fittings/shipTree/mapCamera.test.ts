import { describe, expect, it } from 'vitest';
import {
  FIT_FLOOR,
  MAX_ZOOM,
  fitCamera,
  focusCamera,
  initialCamera,
  zoomAround,
} from './mapCamera';

describe('fitCamera', () => {
  it('centres the tree at 100% when it fits', () => {
    expect(fitCamera({ width: 400, height: 200 }, { width: 1000, height: 600 })).toEqual({
      z: 1,
      x: 300,
      y: 200,
    });
  });
  it('shrinks to fit, never below the floor', () => {
    expect(fitCamera({ width: 1920, height: 200 }, { width: 1000, height: 600 }).z).toBe(0.5);
    expect(fitCamera({ width: 100_000, height: 200 }, { width: 1000, height: 600 }).z).toBe(
      FIT_FLOOR
    );
  });
});

describe('initialCamera', () => {
  it('centres the tree at 100%, unlike fitCamera never shrinking it to fit', () => {
    expect(initialCamera({ width: 1920, height: 200 }, { width: 1000, height: 600 })).toEqual({
      z: 1,
      x: -460,
      y: 200,
    });
  });
  it('centres a smaller tree with room to spare, same as fitCamera would', () => {
    expect(initialCamera({ width: 400, height: 200 }, { width: 1000, height: 600 })).toEqual(
      fitCamera({ width: 400, height: 200 }, { width: 1000, height: 600 })
    );
  });
  it('respects a left inset the same way fitCamera does', () => {
    const plain = initialCamera({ width: 400, height: 200 }, { width: 1000, height: 800 });
    const cam = initialCamera({ width: 400, height: 200 }, { width: 1256, height: 800 }, 256);
    expect(cam).toEqual({ ...plain, x: plain.x + 256 });
  });
});

describe('focusCamera', () => {
  it('centres the class and zooms in to at least 80%', () => {
    const node = {
      def: { id: 8, parent: null, lane: 'main' as const },
      x: 100,
      y: 100,
      cols: 1,
      w: 100,
      h: 100,
    };
    expect(focusCamera(node, { width: 1000, height: 600 }, 0.5)).toEqual({
      z: 0.8,
      x: 380,
      y: 180,
    });
  });
});

describe('zoomAround', () => {
  it('keeps the point under the pointer still', () => {
    const cam = zoomAround({ x: 0, y: 0, z: 1 }, 2, 100, 50);
    expect(cam).toEqual({ z: 2, x: -100, y: -50 });
    expect(zoomAround({ x: 0, y: 0, z: 2 }, 10, 0, 0).z).toBe(MAX_ZOOM);
  });
});

describe('fitCamera with a left inset', () => {
  it('fits the tree into the area right of an overlay panel', () => {
    const plain = fitCamera({ width: 1000, height: 500 }, { width: 1000, height: 800 });
    const cam = fitCamera({ width: 1000, height: 500 }, { width: 1256, height: 800 }, 256);
    // Same zoom as a 1000px-wide viewport, centred in the 1000px right of the panel.
    expect(cam).toEqual({ ...plain, x: plain.x + 256 });
  });
});
