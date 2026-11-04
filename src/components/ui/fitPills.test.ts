import { describe, expect, it } from 'vitest';
import { fitPills } from './fitPills';

const GAP = 8;

describe('fitPills', () => {
  it('shows every pill when they all fit beside the trailing control', () => {
    // 100 + 8 + 100 + 8 + 60 = 276
    expect(fitPills({ pills: [100, 100], more: 30, trailing: 60, available: 276, gap: GAP })).toBe(
      2
    );
  });

  it('drops pills from the end and reserves room for the "+N" pill', () => {
    // All three: 100+8+100+8+100+8+60 = 384 > 300.
    // Two plus "+1": 100+8+100+8+30+8+60 = 314 > 300.
    // One plus "+2": 100+8+30+8+60 = 206 <= 300.
    expect(
      fitPills({ pills: [100, 100, 100], more: 30, trailing: 60, available: 300, gap: GAP })
    ).toBe(1);
  });

  it('can show no pill at all, only "+N" and the trailing control', () => {
    expect(fitPills({ pills: [400, 400], more: 30, trailing: 60, available: 120, gap: GAP })).toBe(
      0
    );
  });

  it('shows everything when nothing has been laid out yet', () => {
    // jsdom and a hidden tab report zero widths; hiding every pill there would
    // make the row unreadable to tests and to the first paint alike.
    expect(fitPills({ pills: [0, 0, 0], more: 0, trailing: 0, available: 0, gap: GAP })).toBe(3);
  });

  it('is zero for no pills', () => {
    expect(fitPills({ pills: [], more: 30, trailing: 60, available: 300, gap: GAP })).toBe(0);
  });
});
