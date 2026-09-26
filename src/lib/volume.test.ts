import { describe, it, expect } from 'vitest';
import { formatUnitVolume } from './volume';

describe('formatUnitVolume', () => {
  it('keeps small volumes legible', () => {
    expect(formatUnitVolume(0.01)).toBe('0.01 m³');
    expect(formatUnitVolume(0.0025)).toBe('0.0025 m³');
  });

  it('thousands-separates large volumes without trailing zeros', () => {
    expect(formatUnitVolume(470000)).toBe('470,000 m³');
    expect(formatUnitVolume(2.5)).toBe('2.5 m³');
  });
});
