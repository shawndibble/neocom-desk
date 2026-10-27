import { describe, it, expect } from 'vitest';
import { ME_MAX, TE_MAX, clampMe } from './efficiency';

describe('efficiency bounds', () => {
  it('uses the game bounds', () => {
    expect(ME_MAX).toBe(10);
    expect(TE_MAX).toBe(20);
  });

  it('clampMe rounds and clamps to 0..ME_MAX', () => {
    expect(clampMe(-3)).toBe(0);
    expect(clampMe(4.4)).toBe(4);
    expect(clampMe(4.6)).toBe(5);
    expect(clampMe(99)).toBe(ME_MAX);
  });
});
