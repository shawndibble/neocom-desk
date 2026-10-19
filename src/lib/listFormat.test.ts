import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { formatList } from './listFormat';

describe('formatList', () => {
  afterEach(() => {
    i18n.language = 'en';
  });

  it('joins with a conjunction', () => {
    expect(formatList(['A', 'B', 'C'])).toBe('A, B, and C');
    expect(formatList(['A', 'B'])).toBe('A and B');
    expect(formatList(['A'])).toBe('A');
  });

  it('follows i18n.language', () => {
    i18n.language = 'de';
    expect(formatList(['A', 'B', 'C'])).toBe('A, B und C');
  });
});
