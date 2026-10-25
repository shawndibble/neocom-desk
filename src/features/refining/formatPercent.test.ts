import { describe, expect, it } from 'vitest';
import { formatPercent } from './formatPercent';

describe('formatPercent', () => {
  it('drops trailing zeros', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.545)).toBe('54.5%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('can leave the sign off for a field', () => {
    expect(formatPercent(0.0125, false)).toBe('1.25');
  });
});
