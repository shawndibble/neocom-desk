import { describe, expect, it } from 'vitest';
import { fractionBar, signedCell, signedTone } from './cellKit';

describe('signedTone', () => {
  it('is good above zero, bad below, none at zero or unknown', () => {
    expect(signedTone(5)).toBe('good');
    expect(signedTone(-0.1)).toBe('bad');
    expect(signedTone(0)).toBeUndefined();
    expect(signedTone(Number.NaN)).toBeUndefined();
  });
});

describe('signedCell', () => {
  it('keeps the text and adds the tone only when there is a direction', () => {
    expect(signedCell('+1.2M', 1_200_000)).toEqual({ text: '+1.2M', tone: 'good' });
    expect(signedCell('-3K', -3000)).toEqual({ text: '-3K', tone: 'bad' });
    expect(signedCell('0', 0)).toBe('0');
  });
});

describe('fractionBar', () => {
  it('is value over max, clamped to 0..1', () => {
    expect(fractionBar(15, 30)).toBe(0.5);
    expect(fractionBar(60, 30)).toBe(1);
    expect(fractionBar(-1, 30)).toBe(0);
  });
  it('is undefined without a real max or value', () => {
    expect(fractionBar(1, 0)).toBeUndefined();
    expect(fractionBar(Number.NaN, 10)).toBeUndefined();
    expect(fractionBar(1, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
