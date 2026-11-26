import { describe, expect, it } from 'vitest';
import { fitPills } from './fitPills';

const GAP = 8;

describe('fitPills', () => {
  it('shows every pill when they all fit beside the trailing control', () => {
    expect(fitPills({ pills: [100, 100], more: 30, trailing: 60, available: 276, gap: GAP })).toBe(
      2
    );
  });

  it('drops pills from the end and reserves room for the "+N" pill', () => {
    expect(
      fitPills({ pills: [100, 100, 100], more: 30, trailing: 60, available: 300, gap: GAP })
    ).toBe(1);
  });

  it('always keeps the first pill, which then shrinks to the room left', () => {
    expect(fitPills({ pills: [400, 400], more: 30, trailing: 60, available: 120, gap: GAP })).toBe(
      1
    );
    expect(fitPills({ pills: [400], more: 30, trailing: 60, available: 120, gap: GAP })).toBe(1);
  });

  it('shows everything when nothing has been laid out yet', () => {
    expect(fitPills({ pills: [0, 0, 0], more: 0, trailing: 0, available: 0, gap: GAP })).toBe(3);
  });

  it('is zero for no pills', () => {
    expect(fitPills({ pills: [], more: 30, trailing: 60, available: 300, gap: GAP })).toBe(0);
  });
});
