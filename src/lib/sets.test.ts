import { describe, it, expect } from 'vitest';
import { toggleInSet } from './sets';

describe('toggleInSet', () => {
  it('adds a missing member', () => {
    expect(toggleInSet(new Set([1]), 2)).toEqual(new Set([1, 2]));
  });
  it('removes a present member', () => {
    expect(toggleInSet(new Set([1, 2]), 2)).toEqual(new Set([1]));
  });
  it('returns a new set and leaves the input untouched', () => {
    const input = new Set(['a']);
    const out = toggleInSet(input, 'b');
    expect(out).not.toBe(input);
    expect([...input]).toEqual(['a']);
  });
});
