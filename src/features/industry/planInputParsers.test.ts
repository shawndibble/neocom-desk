import { describe, expect, it } from 'vitest';
import { parseOrKeep, parseTaxPct } from './planInputParsers';

describe('parseOrKeep', () => {
  it('transforms a number', () => {
    expect(parseOrKeep(5, '1,200', (n) => n * 2)).toBe(2400);
  });
  it('keeps current on blank or garbage', () => {
    expect(parseOrKeep(5, '', (n) => n)).toBe(5);
    expect(parseOrKeep(5, 'abc', (n) => n)).toBe(5);
  });
});

describe('parseTaxPct', () => {
  it('reads a decimal comma', () => {
    expect(parseTaxPct(1, '2,5')).toBe(2.5);
  });
  it('clamps to 0–100', () => {
    expect(parseTaxPct(1, '250')).toBe(100);
    expect(parseTaxPct(1, '0')).toBe(0);
  });
  it('keeps current on garbage', () => {
    expect(parseTaxPct(7, 'x')).toBe(7);
  });
});
