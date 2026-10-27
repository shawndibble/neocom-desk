import { describe, expect, it } from 'vitest';
import { parseOrKeep, parseTaxPct } from './planInputParsers';

describe('parseOrKeep', () => {
  it('keeps current on blank or garbage input', () => {
    expect(parseOrKeep(5, '', (n) => n)).toBe(5);
    expect(parseOrKeep(5, 'abc', (n) => n)).toBe(5);
  });

  it('transforms a parsed number', () => {
    expect(parseOrKeep(5, '1,200', (n) => n * 2)).toBe(2400);
  });
});

describe('parseTaxPct', () => {
  it('reads a decimal comma', () => {
    expect(parseTaxPct(0, '2,5')).toBe(2.5);
  });

  it('clamps to 0-100', () => {
    expect(parseTaxPct(0, '250')).toBe(100);
  });

  it('keeps current on blank input', () => {
    expect(parseTaxPct(3, '')).toBe(3);
  });
});
