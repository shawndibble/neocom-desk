import { describe, expect, it } from 'vitest';
import { parseStructureFees, withStructureFee, withoutStructureFee } from './structureFees';

describe('parseStructureFees', () => {
  it('keeps valid entries, including an explicit 0', () => {
    expect(parseStructureFees({ 1000000000001: 2.5, 1000000000002: 0 })).toEqual({
      1000000000001: 2.5,
      1000000000002: 0,
    });
  });
  it('drops bad ids and out-of-range or non-numeric rates', () => {
    expect(parseStructureFees({ abc: 1, 5: -1, 6: 101, 7: 'x', 8: Number.NaN, 9: 3 })).toEqual({
      9: 3,
    });
  });
  it('treats a non-object as empty', () => {
    expect(parseStructureFees(null)).toEqual({});
    expect(parseStructureFees([1])).toEqual({});
  });
});

describe('withStructureFee / withoutStructureFee', () => {
  it('sets and clears one structure', () => {
    const set = withStructureFee({}, 5, 2);
    expect(set).toEqual({ 5: 2 });
    expect(withoutStructureFee(set, 5)).toEqual({});
  });
  it('refuses NaN rather than declaring the structure free', () => {
    const fees = { 5: 2 };
    expect(withStructureFee(fees, 5, Number.NaN)).toBe(fees);
  });
  it('clamps into 0..100', () => {
    expect(withStructureFee({}, 5, -3)).toEqual({ 5: 0 });
    expect(withStructureFee({}, 5, 500)).toEqual({ 5: 100 });
  });
});
