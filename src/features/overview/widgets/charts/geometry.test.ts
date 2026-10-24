import { describe, expect, it } from 'vitest';
import {
  areaPoints,
  barHeights,
  areaCoords,
  linesRuns,
  donutSegments,
  hbarPercent,
  sharesOfMax,
  stackedAreaBands,
  stackPercents,
} from './geometry';

describe('areaPoints', () => {
  it('spreads x over 0..100 and puts the low value at the bottom', () => {
    const { line, polygon } = areaPoints([1, 3, 2], 44);
    expect(line).toEqual(['0.0,40.0', '50.0,6.0', '100.0,23.0']);
    expect(polygon).toBe('0,44 0.0,40.0 50.0,6.0 100.0,23.0 100,44');
  });

  it('draws a flat series mid-way instead of dividing by zero', () => {
    const { line } = areaPoints([5, 5, 5], 44);
    expect(line.every((p) => p.endsWith(',40.0'))).toBe(true);
  });

  it('needs two points to be a line', () => {
    expect(areaPoints([1], 44).line).toEqual([]);
    expect(areaPoints([], 44).line).toEqual([]);
  });
});

describe('barHeights', () => {
  it('scales to the tallest bar and marks it as the peak', () => {
    const { heights, peak } = barHeights([2, 4, 1]);
    expect(heights).toEqual([50, 100, 25]);
    expect(peak).toBe(1);
  });

  it('keeps a tiny non-zero bar visible, and a zero bar empty', () => {
    const { heights } = barHeights([1000, 1, 0]);
    expect(heights[1]).toBe(3);
    expect(heights[2]).toBe(0);
  });

  it('has no peak when nothing is above zero', () => {
    expect(barHeights([0, 0, 0])).toEqual({ heights: [0, 0, 0], peak: null });
    expect(barHeights([])).toEqual({ heights: [], peak: null });
  });

  it('treats a negative value as empty rather than drawing it downwards', () => {
    expect(barHeights([-5, 5]).heights).toEqual([0, 100]);
  });

  it('takes the first of equal peaks', () => {
    expect(barHeights([3, 3]).peak).toBe(0);
  });
});

describe('sharesOfMax', () => {
  it('is relative to the largest value, in 0..1', () => {
    expect(sharesOfMax([10, 5, 0])).toEqual([1, 0.5, 0]);
  });

  it('is all zero when there is nothing to compare', () => {
    expect(sharesOfMax([0, 0])).toEqual([0, 0]);
  });
});

describe('hbarPercent', () => {
  it('clamps to 0..100 and keeps a non-zero share visible', () => {
    expect(hbarPercent(0.5)).toBe(50);
    expect(hbarPercent(2)).toBe(100);
    expect(hbarPercent(-1)).toBe(0);
    expect(hbarPercent(0.001)).toBe(3);
  });
});

describe('stackPercents', () => {
  it('shares sum to 100', () => {
    const p = stackPercents([1, 1, 2]);
    expect(p).toEqual([25, 25, 50]);
  });

  it('is empty-safe', () => {
    expect(stackPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('donutSegments', () => {
  it('lays segments end to end around a circle of circumference 100', () => {
    const segs = donutSegments([3, 1]);
    expect(segs[0]).toEqual({ dash: 75, gap: 25, offset: 0 });
    expect(segs[1]).toEqual({ dash: 25, gap: 75, offset: -75 });
  });

  it('draws nothing for a zero total', () => {
    expect(donutSegments([0, 0])).toEqual([]);
  });

  it('gives a zero part an empty segment so indexes still line up', () => {
    const segs = donutSegments([0, 4]);
    expect(segs).toEqual([
      { dash: 0, gap: 100, offset: 0 },
      { dash: 100, gap: 0, offset: 0 },
    ]);
  });
});

describe('stackedAreaBands', () => {
  it('stacks each layer on the one below, scaled from zero to the tallest total', () => {
    const bands = stackedAreaBands(
      [
        [1, 1],
        [1, 1],
      ],
      100
    );
    expect(bands).toEqual(['0,52.0 100,52.0 100,100.0 0,100.0', '0,4.0 100,4.0 100,52.0 0,52.0']);
  });

  it('draws nothing under two points or with nothing above zero', () => {
    expect(stackedAreaBands([[1]], 100)).toEqual([]);
    expect(stackedAreaBands([[0, 0]], 100)).toEqual([]);
    expect(stackedAreaBands([], 100)).toEqual([]);
  });

  it('treats a negative value as nothing rather than folding the stack back', () => {
    const bands = stackedAreaBands(
      [
        [1, 1],
        [-5, -5],
      ],
      100
    );
    expect(bands[1]).toBe('0,4.0 100,4.0 100,4.0 0,4.0');
  });
});

describe('areaCoords', () => {
  it('puts the low point near the floor and the high point near the top, evenly across x', () => {
    const [a, b, c] = areaCoords([0, 5, 10], 70);
    expect([a!.x, b!.x, c!.x]).toEqual([0, 50, 100]);
    expect(a!.y).toBe(66);
    expect(c!.y).toBe(6);
  });

  it('gives nothing for fewer than two values', () => {
    expect(areaCoords([3], 70)).toEqual([]);
  });
});

describe('linesRuns', () => {
  it('scales every line on one shared range', () => {
    const [a, b] = linesRuns(
      [
        [0, 10],
        [5, 5],
      ],
      20
    );
    expect(a).toEqual(['0.0,16.0 100.0,6.0']);
    expect(b).toEqual(['0.0,11.0 100.0,11.0']);
  });

  it('breaks a line at a gap and drops a one-day run', () => {
    const [a] = linesRuns([[1, 2, null, 3, null, 4, 5]], 20);
    expect(a).toHaveLength(2);
  });

  it('draws nothing for an all-gap series', () => {
    expect(linesRuns([[null, null]], 20)).toEqual([[]]);
  });
});
