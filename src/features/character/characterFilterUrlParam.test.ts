import { describe, it, expect } from 'vitest';
import { characterFilterParam } from './characterFilterUrlParam';

describe('characterFilterParam', () => {
  const codec = characterFilterParam('current');

  it('omits the default and parses absence back to it', () => {
    expect(codec.serialize('current')).toBeNull();
    expect(codec.parse(null)).toBe('current');
  });

  it('round-trips all and an id subset, ids sorted', () => {
    expect(codec.parse(codec.serialize('all'))).toBe('all');
    expect(codec.serialize(new Set([9, 3]))).toBe('3,9');
    expect(codec.parse('9,3')).toEqual(new Set([3, 9]));
  });

  it('falls back to the default for garbage', () => {
    expect(codec.parse('someone')).toBe('current');
    expect(codec.parse('1,x')).toBe('current');
    expect(codec.parse('')).toBe('current');
  });

  it('treats a subset default by value, not identity', () => {
    const subset = characterFilterParam(new Set([2, 1]));
    expect(subset.serialize(new Set([1, 2]))).toBeNull();
    expect(subset.serialize('current')).toBe('current');
  });
});
