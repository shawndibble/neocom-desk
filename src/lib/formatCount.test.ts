import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { formatCount } from './formatCount';

describe('formatCount', () => {
  afterEach(() => {
    i18n.language = 'en';
  });

  it('rounds and groups in English', () => {
    expect(formatCount(12345.6)).toBe('12,346');
    expect(formatCount(0.4)).toBe('0');
  });

  it('follows i18n.language', () => {
    i18n.language = 'de';
    expect(formatCount(1234567)).toBe('1.234.567');
  });
});
