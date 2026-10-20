import { describe, expect, it } from 'vitest';
import { swing, wobble } from './samplePilot';

describe('samplePilot', () => {
  it('swing is deterministic and within -1..1', () => {
    for (let i = 0; i < 50; i++) {
      expect(swing(i, 1.7)).toBe(swing(i, 1.7));
      expect(Math.abs(swing(i, 1.7))).toBeLessThanOrEqual(1);
    }
  });

  it('wobble is swing rescaled to 0..1', () => {
    for (let i = 0; i < 50; i++) {
      expect(wobble(i, 2.3)).toBeCloseTo((swing(i, 2.3) + 1) / 2, 12);
      expect(wobble(i, 2.3)).toBeGreaterThanOrEqual(0);
      expect(wobble(i, 2.3)).toBeLessThanOrEqual(1);
    }
  });
});
