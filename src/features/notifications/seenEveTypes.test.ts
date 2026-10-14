import { describe, expect, it } from 'vitest';
import { mergeSeenEveTypes, parseSeenEveTypes } from './seenEveTypes';

describe('mergeSeenEveTypes', () => {
  it('unions the incoming types, sorted, without dropping stored ones', () => {
    expect(mergeSeenEveTypes({ '1': ['B'] }, { '1': ['C', 'A'] })).toEqual({
      '1': ['A', 'B', 'C'],
    });
  });

  it('adds a Character it has not seen before', () => {
    expect(mergeSeenEveTypes({}, { '2': ['A'] })).toEqual({ '2': ['A'] });
  });

  it('returns the same object when nothing is new', () => {
    const current = { '1': ['A', 'B'] };
    expect(mergeSeenEveTypes(current, { '1': ['B'] })).toBe(current);
  });
});

describe('parseSeenEveTypes', () => {
  it('rejects a non-object and drops non-string entries', () => {
    expect(parseSeenEveTypes([])).toBeNull();
    expect(parseSeenEveTypes({ '1': ['A', 7], '2': 'x' })).toEqual({ '1': ['A'], '2': [] });
  });
});
