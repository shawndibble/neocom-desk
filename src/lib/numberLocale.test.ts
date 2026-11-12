import { afterEach, describe, expect, it } from 'vitest';
import {
  createNumberFormat,
  detectDecimalMark,
  formatNumber,
  getDecimalMark,
  getGroupMark,
  numberFormatExample,
  setDecimalMark,
  setNumberStyle,
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
    expect(numberFormatExample('period')).toBe('1,234.56');
    expect(numberFormatExample('comma')).toBe('1.234,56');
    expect(numberFormatExample('apostrophe')).toMatch(/^1['\u2019]234\.56$/);
  });

  it('writes the Swiss style with a period decimal and an apostrophe group', () => {
    const isk = createNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setNumberStyle('apostrophe');
    expect(getDecimalMark()).toBe('.');
    expect(getGroupMark()).toMatch(/^['\u2019]$/);
    expect(isk(5_100_000)).toMatch(/^5['\u2019]100['\u2019]000\.00$/);
    // Back to English on the same mark: the style, not the mark, picks the grouping.
    setNumberStyle('period');
    expect(isk(5_100_000)).toBe('5,100,000.00');
  });
});
