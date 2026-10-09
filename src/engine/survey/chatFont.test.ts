import { describe, expect, it } from 'vitest';
import { textWidth } from './chatFont';

/**
 * Fixtures are pixel measurements of EVE's chat at font size 12: a `║`, ten or
 * twenty copies of one character, and a `║`, screenshotted and measured from the
 * left `║`'s start to the right `║`'s start.
 */
describe('textWidth', () => {
  it('measures the alphabets exactly as the chat draws them', () => {
    expect(textWidth('abcdefghijklmnopqrstuvwxyz')).toBe(170);
    expect(textWidth('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(195);
    expect(textWidth('0123456789')).toBe(70);
  });

  it('measures the box and block characters at 8px and a space at 7px', () => {
    for (const c of '═║█░▒▓╔╗╚╝─│┌└╌┄┈') expect(textWidth(c)).toBe(8);
    expect(textWidth(' ')).toBe(7);
  });

  it('measures the punctuation the message uses', () => {
    const widths: Record<string, number> = {
      '·': 4,
      ':': 4,
      '.': 4,
      '/': 7,
      '%': 10,
      '(': 6,
      ')': 6,
      '[': 6,
      ']': 6,
      '~': 7,
      '-': 7,
      ',': 4,
      "'": 4,
    };
    for (const [c, px] of Object.entries(widths)) expect(textWidth(c)).toBe(px);
  });

  it('matches a real row: a Left row whose right ║ started 229px in', () => {
    expect(textWidth('║ Left: 5 Clear Icicle' + ' '.repeat(14))).toBe(229);
  });

  it('gives a character it has not measured the digit width', () => {
    expect(textWidth('€')).toBe(7);
  });
});
