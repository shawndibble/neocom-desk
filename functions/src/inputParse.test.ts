import { describe, expect, it } from 'vitest';
import { intIn, oneOf, optionalIntIn } from './inputParse.js';

describe('inputParse', () => {
  it('oneOf accepts a member and names the choices otherwise', () => {
    expect(oneOf('a', 'kind', ['a', 'b'] as const)).toBe('a');
    expect(() => oneOf('c', 'kind', ['a', 'b'] as const)).toThrow('kind must be one of a, b');
    expect(() => oneOf(1, 'kind', ['a'] as const)).toThrow('kind must be one of a');
  });

  it('intIn bounds a safe integer', () => {
    expect(intIn(5, 'n', 1, 5)).toBe(5);
    for (const bad of [0, 6, 1.5, '3', NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => intIn(bad, 'n', 1, 5)).toThrow('n must be a whole number from 1 to 5');
    }
  });

  it('optionalIntIn lets undefined and null through', () => {
    expect(optionalIntIn(undefined, 'n', 0, 9)).toBeUndefined();
    expect(optionalIntIn(null, 'n', 0, 9)).toBeUndefined();
    expect(optionalIntIn(3, 'n', 0, 9)).toBe(3);
    expect(() => optionalIntIn(10, 'n', 0, 9)).toThrow('n must be a whole number from 0 to 9');
  });
});
