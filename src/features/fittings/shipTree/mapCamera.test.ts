import { describe, expect, it } from 'vitest';
import {
  FIT_FLOOR,
  MAX_ZOOM,
  fitCamera,
  focusCamera,
  wheelZoomFactor,
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

describe('wheelZoomFactor', () => {
  const PIXEL = 0;
  const LINE = 1;
  const PAGE = 2;
  it('ignores a wheel event with no vertical delta (a sideways swipe, shift+wheel)', () => {
    expect(wheelZoomFactor(0, PIXEL)).toBe(1);
    expect(wheelZoomFactor(0, LINE)).toBe(1);
  });
  it('zooms a classic 100px mouse notch by about 12%, in when scrolling up', () => {
    expect(wheelZoomFactor(-100, PIXEL)).toBeCloseTo(1.12, 5);
    expect(wheelZoomFactor(100, PIXEL)).toBeCloseTo(1 / 1.12, 5);
  });
  it('scales with the delta, so a trackpad or pinch nudge zooms only a little', () => {
    const nudge = wheelZoomFactor(-4, PIXEL);
    expect(nudge).toBeGreaterThan(1);
    expect(nudge).toBeLessThan(1.01);
    expect(wheelZoomFactor(-50, PIXEL) ** 2).toBeCloseTo(wheelZoomFactor(-100, PIXEL), 10);
  });
  it('reads line and page deltas as pixels: a 3-line notch is about one mouse notch', () => {
    expect(wheelZoomFactor(-3, LINE)).toBeCloseTo(1.12, 2);
    expect(wheelZoomFactor(1, PAGE)).toBeLessThan(1);
  });
  it('caps one event, so a huge delta is still one controlled step', () => {
    expect(wheelZoomFactor(-100_000, PIXEL)).toBe(wheelZoomFactor(-2_000, PIXEL));
    expect(wheelZoomFactor(-100_000, PIXEL)).toBeLessThan(1.5);
    expect(wheelZoomFactor(5, PAGE)).toBe(wheelZoomFactor(100_000, PIXEL));
  });
});
