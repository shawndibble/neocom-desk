import { describe, expect, it } from 'vitest';
import { parseLocalizedNumber } from './parseLocalizedNumber';

describe('parseLocalizedNumber', () => {
  it.each([
    ['964', 964],
    ['0', 0],
    ['8,016', 8016],
    ['8.016', 8016],
    ['184,000.00', 184_000],
    ['5.100.000,00', 5_100_000],
    ['5,100,000.00', 5_100_000],
    ['1.820.000,50', 1_820_000.5],
    ['1,820,000.50', 1_820_000.5],
    ['1.178', 1178],
    ['1.178.000', 1_178_000],
    ['1,178,000', 1_178_000],
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['12.50', 12.5],
    ['0.500', 0.5],
    ['0,500', 0.5],
    ['1234,567', 1234.567],
    ['124 500', 124_500],
    ["124'500", 124_500],
    ['124\u00a0500,25', 124_500.25],
    ['-1.234,56', -1234.56],
    ['  42  ', 42],
    ['.5', 0.5],
    [',5', 0.5],
  ])('reads %s as %d', (text, expected) => {
    expect(parseLocalizedNumber(text)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '1,23,456', '1.234.56', '1,234,5.5', '12.', '1e5', '5 m3', '--1'])(
    'refuses %j',
    (text) => {
      expect(parseLocalizedNumber(text)).toBeNull();
    }
  );

  it('lets the typed-text decimal mark settle a single three-digit group', () => {
    expect(parseLocalizedNumber('1.234', '.')).toBe(1.234);
    expect(parseLocalizedNumber('1,234', '.')).toBe(1234);
    expect(parseLocalizedNumber('1,234', ',')).toBe(1.234);
    expect(parseLocalizedNumber('1.234', ',')).toBe(1234);
    expect(parseLocalizedNumber('1.234,5', '.')).toBe(1234.5);
  });
});
