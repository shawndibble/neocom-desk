import { afterEach, describe, expect, it } from 'vitest';
import {
  createNumberFormat,
  detectDecimalMark,
  formatNumber,
  numberFormatExample,
  setDecimalMark,
} from './numberLocale';

afterEach(() => setDecimalMark('.'));

describe('numberLocale', () => {
  it('reads the decimal mark a locale writes', () => {
    expect(detectDecimalMark('en-US')).toBe('.');
    expect(detectDecimalMark('de-DE')).toBe(',');
    expect(detectDecimalMark('fr-FR')).toBe(',');
    expect(detectDecimalMark('not a locale')).toBe('.');
  });

  it('formats with the active mark, including formatters built before it changed', () => {
    const isk = createNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(isk(5_100_000)).toBe('5,100,000.00');
    setDecimalMark(',');
    expect(isk(5_100_000)).toBe('5.100.000,00');
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });

  it('shows an example of each format', () => {
    expect(numberFormatExample('.')).toBe('1,234,567.89');
    expect(numberFormatExample(',')).toBe('1.234.567,89');
  });
});
