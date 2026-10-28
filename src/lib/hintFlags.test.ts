import { describe, it, expect, beforeEach } from 'vitest';
import {
  claimSessionHint,
  hintSeenCount,
  parseHintCounts,
  recordHintSeen,
  resetSessionHints,
  useHintCounts,
} from './hintFlags';

beforeEach(() => {
  useHintCounts.setState({ value: {}, hydrated: true });
  resetSessionHints();
});

describe('parseHintCounts', () => {
  it('keeps positive whole-number counts and drops the rest', () => {
    expect(parseHintCounts({ a: 2, b: -1, c: 'x', d: 1.5, e: 0 })).toEqual({ a: 2 });
  });

  it('rejects anything that is not a plain object', () => {
    expect(parseHintCounts(null)).toBeNull();
    expect(parseHintCounts([1])).toBeNull();
    expect(parseHintCounts('a')).toBeNull();
  });
});

describe('recordHintSeen', () => {
  it('counts each sighting of one hint apart from the others', () => {
    recordHintSeen('rowMenuTip');
    recordHintSeen('rowMenuTip');
    recordHintSeen('goTo');
    expect(hintSeenCount(useHintCounts.getState().value, 'rowMenuTip')).toBe(2);
    expect(hintSeenCount(useHintCounts.getState().value, 'goTo')).toBe(1);
    expect(hintSeenCount(useHintCounts.getState().value, 'never')).toBe(0);
  });
});

describe('claimSessionHint', () => {
  it('gives the session to one hint only', () => {
    expect(claimSessionHint('goTo')).toBe(true);
    expect(claimSessionHint('rowHint')).toBe(false);
  });

  it('lets the owner ask again, so a re-render keeps its hint', () => {
    expect(claimSessionHint('goTo')).toBe(true);
    expect(claimSessionHint('goTo')).toBe(true);
  });
});
