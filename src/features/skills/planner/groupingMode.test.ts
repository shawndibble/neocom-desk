import { describe, it, expect } from 'vitest';
import { isGroupingMode } from './groupingMode';

describe('isGroupingMode', () => {
  it('accepts the two known modes', () => {
    expect(isGroupingMode('priority')).toBe(true);
    expect(isGroupingMode('attributePair')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isGroupingMode('other')).toBe(false);
    expect(isGroupingMode(null)).toBe(false);
    expect(isGroupingMode(undefined)).toBe(false);
    expect(isGroupingMode(42)).toBe(false);
  });
});
