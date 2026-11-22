import { describe, expect, it } from 'vitest';
import { parsePercent } from './parsePercent';

describe('parsePercent', () => {
  it('reads a period or comma decimal alike', () => {
    expect(parsePercent('7.5')).toBe(7.5);
    expect(parsePercent('7,5')).toBe(7.5);
    expect(parsePercent(' 10 ')).toBe(10);
    expect(parsePercent('0')).toBe(0);
  });
  it('answers null for blank or non-numeric text', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('  ')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('1,2,3')).toBeNull();
  });
});
