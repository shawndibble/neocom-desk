import { describe, it, expect } from 'vitest';
import { formatCompactNumber } from './compactNumber';

describe('formatCompactNumber', () => {
  it('leaves small values unabbreviated', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('abbreviates thousands with one fraction digit', () => {
    expect(formatCompactNumber(1_500)).toBe('1.5K');
    expect(formatCompactNumber(12_345)).toBe('12.3K');
  });

  it('abbreviates millions', () => {
    expect(formatCompactNumber(5_234_000)).toBe('5.2M');
  });

  it('abbreviates billions', () => {
    expect(formatCompactNumber(1_234_567_890)).toBe('1.2B');
  });

  it('preserves a leading minus', () => {
    expect(formatCompactNumber(-1_500)).toBe('-1.5K');
  });
});
