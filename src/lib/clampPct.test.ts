import { describe, it, expect } from 'vitest';
import { clampPct } from './clampPct';

describe('clampPct', () => {
  it('clamps to 0..100', () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(42.5)).toBe(42.5);
    expect(clampPct(250)).toBe(100);
  });
});
