import { describe, expect, it } from 'vitest';
import { isFiniteNumber, isRecord } from './guards';

describe('isRecord', () => {
  it('accepts objects', () => expect(isRecord({ a: 1 })).toBe(true));
  it('rejects null and primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('isFiniteNumber', () => {
  it('accepts finite numbers', () => expect(isFiniteNumber(0)).toBe(true));
  it('rejects NaN, Infinity and non-numbers', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });
});
