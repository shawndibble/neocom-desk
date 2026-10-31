import { afterEach, describe, expect, it } from 'vitest';
import { setDecimalMark } from './numberLocale';
import { formatSignedPercent, percentDirection, savingTone } from './formatSignedPercent';

describe('formatSignedPercent', () => {
  afterEach(() => setDecimalMark('.'));

  it('follows the Number format setting', () => {
    setDecimalMark(',');
    expect(formatSignedPercent(-6.9447)).toBe('−6,9%');
    expect(formatSignedPercent(1234.56)).toBe('+1.234,6%');
  });

  it('prints a sign, one decimal and a true minus for a drop', () => {
    expect(formatSignedPercent(-6.9447)).toBe('−6.9%');
    expect(formatSignedPercent(2.43)).toBe('+2.4%');
  });

  it('prints no sign for a difference that rounds to zero', () => {
    expect(formatSignedPercent(0.04)).toBe('0.0%');
    expect(formatSignedPercent(-0.04)).toBe('0.0%');
  });

  it('keeps large figures readable', () => {
    expect(formatSignedPercent(-14.02)).toBe('−14.0%');
    expect(formatSignedPercent(1234.56)).toBe('+1,234.6%');
  });
});

describe('percentDirection', () => {
  it('says which way a difference leans, by what the reader would see printed', () => {
    expect(percentDirection(-6.94)).toBe('below');
    expect(percentDirection(2.43)).toBe('above');
  });

  it('says level for a difference that prints as 0.0%, whichever side of zero it fell', () => {
    expect(percentDirection(0.04)).toBe('level');
    expect(percentDirection(-0.04)).toBe('level');
    expect(percentDirection(0)).toBe('level');
  });
});

describe('savingTone', () => {
  it('is good at 0.0% and above, bad below', () => {
    expect(savingTone(5)).toBe('good');
    expect(savingTone(0)).toBe('good');
    expect(savingTone(-0.04)).toBe('good');
    expect(savingTone(-0.1)).toBe('bad');
  });
});

describe('a half-tenth saving', () => {
  it('prints 0.0% and reads level, so words, figure and tone agree', () => {
    expect(formatSignedPercent(-0.05)).toBe('0.0%');
    expect(percentDirection(-0.05)).toBe('level');
    expect(savingTone(-0.05)).toBe('good');
  });
});
