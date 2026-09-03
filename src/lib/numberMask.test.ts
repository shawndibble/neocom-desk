import { describe, it, expect } from 'vitest';
import { maskNumber, unmaskNumber } from './numberMask';

describe('maskNumber', () => {
  it('groups thousands', () => {
    expect(maskNumber(338600)).toBe('338,600');
    expect(maskNumber(1250000)).toBe('1,250,000');
  });

  it('leaves a number with nothing to group alone', () => {
    expect(maskNumber(5)).toBe('5');
    expect(maskNumber(0)).toBe('0');
  });

  it("keeps the value's own decimals rather than fixing a precision", () => {
    // The difference from `formatIsk`, and the reason this exists: a field
    // showing "6,622" for a stored 6,622.35 would round the player's own
    // number away in front of them.
    expect(maskNumber(6622.35)).toBe('6,622.35');
    expect(maskNumber(0.05)).toBe('0.05');
    expect(maskNumber(1234.5)).toBe('1,234.5');
  });
});

describe('unmaskNumber', () => {
  it('reads back what maskNumber wrote', () => {
    for (const value of [0, 5, 338600, 1250000, 6622.35, 0.05]) {
      expect(unmaskNumber(maskNumber(value))).toBe(value);
    }
  });

  it('accepts separators and padding, so a pasted number works', () => {
    expect(unmaskNumber('1,250')).toBe(1250);
    expect(unmaskNumber(' 338,600 ')).toBe(338600);
    // Some tools export with spaces as the group separator.
    expect(unmaskNumber('1 000 000')).toBe(1000000);
  });

  it('takes a plain number, which is what the field holds mid-edit', () => {
    expect(unmaskNumber('338600')).toBe(338600);
    expect(unmaskNumber('.5')).toBe(0.5);
  });

  it('rejects blank, garbage and negatives as "nothing set"', () => {
    // Same contract the sourcing fields already had: clearing the box is how
    // you unset the override, and nonsense must not become a price.
    expect(unmaskNumber('')).toBeUndefined();
    expect(unmaskNumber('   ')).toBeUndefined();
    expect(unmaskNumber('abc')).toBeUndefined();
    expect(unmaskNumber('-5')).toBeUndefined();
    expect(unmaskNumber('Infinity')).toBeUndefined();
    expect(unmaskNumber('1e400')).toBeUndefined();
  });
});
