import { describe, expect, it } from 'vitest';
import { labelClearsBars, signedBarGeometry } from './signedBars';

describe('signedBarGeometry', () => {
  it('sits every bar on the floor when nothing is negative', () => {
    const g = signedBarGeometry([0, 5, 10]);
    expect(g.baseline).toBe(0);
    expect(g.bars.map((b) => b.negative)).toEqual([false, false, false]);
    expect(g.bars[2]).toMatchObject({ from: 0, size: 100 });
    expect(g.bars[0]!.size).toBe(0);
    expect(g.peak).toBe(2);
  });

  it('lifts the baseline to make room for a loss and draws it below', () => {
    const g = signedBarGeometry([30, -10]);
    expect(g.baseline).toBe(25);
    expect(g.bars[0]).toMatchObject({ from: 25, size: 75, negative: false });
    expect(g.bars[1]).toMatchObject({ from: 0, size: 25, negative: true });
  });

  it('never lets a non-zero bar vanish', () => {
    const g = signedBarGeometry([1000, 1]);
    expect(g.bars[1]!.size).toBeGreaterThanOrEqual(3);
  });

  it('places a reference line on the same scale', () => {
    const g = signedBarGeometry([30, -10], 15);
    expect(g.ref).toBe(25 + 37.5);
    expect(signedBarGeometry([30, -10]).ref).toBeNull();
  });

  it('draws nothing for an all-zero series', () => {
    const g = signedBarGeometry([0, 0], 0);
    expect(g.bars.every((b) => b.size === 0)).toBe(true);
    expect(g.peak).toBeNull();
    expect(g.ref).toBeNull();
  });
});

describe('labelClearsBars', () => {
  const { bars } = signedBarGeometry([4, 3.9, 80, 10]);

  it('drops a label that would print over a taller neighbour', () => {
    expect(labelClearsBars(bars, 1, 5, 120, 100)).toBe(false);
  });

  it('keeps a label whose neighbours sit below it', () => {
    expect(labelClearsBars(bars, 0, 6, 120, 100)).toBe(true);
    expect(labelClearsBars(bars, 2, 6, 120, 100)).toBe(true);
  });

  it('checks a label under a negative bar against the deeper neighbour', () => {
    const signed = signedBarGeometry([10, -2, -40]).bars;
    expect(labelClearsBars(signed, 1, 5, 60, 100)).toBe(false);
    expect(labelClearsBars(signed, 2, 5, 60, 100)).toBe(true);
  });
});
