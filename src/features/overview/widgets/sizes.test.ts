import { describe, expect, it } from 'vitest';
import { SIZE_LAYOUT, SIZES, chartHeight, rowsForSize } from './sizes';

describe('sizes', () => {
  it('lists the sizes in order', () => {
    expect(SIZES).toEqual(['S', 'M', 'L', 'F']);
  });

  it('maps each size to a share of the row and a minimum width', () => {
    expect(SIZE_LAYOUT.S).toEqual({ basis: 1 / 3, minWidth: 190 });
    expect(SIZE_LAYOUT.M).toEqual({ basis: 1 / 2, minWidth: 260 });
    expect(SIZE_LAYOUT.L).toEqual({ basis: 2 / 3, minWidth: 340 });
    expect(SIZE_LAYOUT.F).toEqual({ basis: 1, minWidth: 0 });
  });

  it('shows more list rows as the widget grows', () => {
    expect(rowsForSize).toEqual({ S: 3, M: 4, L: 6, F: 10 });
  });

  it('draws charts taller as the widget grows', () => {
    expect(chartHeight).toEqual({ S: 44, M: 70, L: 100, F: 100 });
  });
});
