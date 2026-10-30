import { describe, expect, it } from 'vitest';
import { SIZE_LAYOUT, chartHeight } from './sizes';
import { GRID_GAP } from './gridStyle';

/** The Overview's content column on a 1440 px desktop with the rail open: 1440 − 208 rail − 32 padding, under `max-w-page`. */
const DESKTOP_CONTENT_WIDTH = 1200;

/** How many widgets of one Size a row of this width holds, by the grid's own wrap rule. */
function perRow(size: keyof typeof SIZE_LAYOUT, width: number): number {
  const { minWidth } = SIZE_LAYOUT[size];
  return Math.max(1, Math.floor((width + GRID_GAP) / (minWidth + GRID_GAP)));
}

describe('sizes', () => {
  it('fits four Small, three Medium and two Large across a 1440 px desktop', () => {
    expect(perRow('S', DESKTOP_CONTENT_WIDTH)).toBeGreaterThanOrEqual(4);
    expect(perRow('M', DESKTOP_CONTENT_WIDTH)).toBeGreaterThanOrEqual(3);
    expect(perRow('L', DESKTOP_CONTENT_WIDTH)).toBeGreaterThanOrEqual(2);
  });

  it('wraps to fewer across, never overflowing, on a narrower viewport', () => {
    for (const width of [992, 720, 480]) {
      for (const size of ['S', 'M', 'L'] as const) {
        const n = perRow(size, width);
        expect(n * SIZE_LAYOUT[size].minWidth + (n - 1) * GRID_GAP).toBeLessThanOrEqual(
          Math.max(width, SIZE_LAYOUT[size].minWidth)
        );
      }
    }
  });

  it('draws charts taller as the widget grows', () => {
    expect(chartHeight).toEqual({ S: 44, M: 70, L: 100, F: 100 });
  });
});
