import { describe, it, expect } from 'vitest';
import {
  resolveCharacterFilter,
  toStoredCharacterFilterValue,
  fromStoredCharacterFilterValue,
  isStoredCharacterFilterValue,
} from './characterFilterValue';

describe('resolveCharacterFilter', () => {
  it('resolves "current" to just the active Character', () => {
    expect(resolveCharacterFilter('current', 42)).toEqual(new Set([42]));
  });

  it('resolves "current" to "all" when there is no active Character', () => {
    expect(resolveCharacterFilter('current', null)).toBe('all');
  });

  it('passes "all" through unchanged', () => {
    expect(resolveCharacterFilter('all', 42)).toBe('all');
  });

  it('passes a concrete subset through unchanged', () => {
    const subset = new Set([1, 2]);
    expect(resolveCharacterFilter(subset, 42)).toBe(subset);
  });
});

describe('toStoredCharacterFilterValue / fromStoredCharacterFilterValue', () => {
  it('round-trips "current"', () => {
    expect(fromStoredCharacterFilterValue(toStoredCharacterFilterValue('current'))).toBe('current');
  });

  it('round-trips "all"', () => {
    expect(fromStoredCharacterFilterValue(toStoredCharacterFilterValue('all'))).toBe('all');
  });

  it('round-trips a concrete subset as a sorted plain array', () => {
    const stored = toStoredCharacterFilterValue(new Set([3, 1, 2]));
    expect(stored).toEqual([1, 2, 3]);
    expect(fromStoredCharacterFilterValue(stored)).toEqual(new Set([1, 2, 3]));
  });
});

describe('isStoredCharacterFilterValue', () => {
  it.each(['current', 'all', [], [1, 2]])('accepts %j', (value) => {
    expect(isStoredCharacterFilterValue(value)).toBe(true);
  });

  it.each([null, undefined, 42, 'other', ['1', 2], { mode: 'all' }])('rejects %j', (value) => {
    expect(isStoredCharacterFilterValue(value)).toBe(false);
  });
});
