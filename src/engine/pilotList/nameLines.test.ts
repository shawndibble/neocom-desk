import { describe, expect, it } from 'vitest';
import { isMultiLine, lineAt, namesOf, replaceLine } from './nameLines';

describe('lineAt', () => {
  const text = 'Zakof\nNim\nPalmi';

  it('finds the line the caret is on', () => {
    expect(lineAt(text, 0).text).toBe('Zakof');
    expect(lineAt(text, 8).text).toBe('Nim');
    expect(lineAt(text, text.length).text).toBe('Palmi');
  });

  it('counts a caret at the end of a line as on that line', () => {
    expect(lineAt(text, 5)).toEqual({ start: 0, end: 5, text: 'Zakof' });
    expect(lineAt(text, 9)).toEqual({ start: 6, end: 9, text: 'Nim' });
  });

  it('reads an empty line, and clamps a caret outside the text', () => {
    expect(lineAt('a\n\nb', 2).text).toBe('');
    expect(lineAt('abc', 99).text).toBe('abc');
    expect(lineAt('abc', -3).text).toBe('abc');
  });
});

describe('namesOf', () => {
  it('trims lines and drops blanks, whatever the line ending', () => {
    expect(namesOf(' Zakof \r\n\r\n  Nimjia\n')).toEqual(['Zakof', 'Nimjia']);
    expect(namesOf('')).toEqual([]);
  });
});

describe('isMultiLine', () => {
  it('is false for one name, even with a trailing newline typed after it', () => {
    expect(isMultiLine('Zakof')).toBe(false);
    expect(isMultiLine('Zakof\n')).toBe(false);
  });

  it('is true once a second line has text', () => {
    expect(isMultiLine('Zakof\nNim')).toBe(true);
    expect(isMultiLine('Zakof\n\nNim')).toBe(true);
  });
});

describe('replaceLine', () => {
  it('swaps only the caret line and puts the caret at the end of it', () => {
    expect(replaceLine('Zakof\nNim\nPalmi', 9, 'Nimjia')).toEqual({
      text: 'Zakof\nNimjia\nPalmi',
      caret: 12,
    });
  });

  it('works on a single line', () => {
    expect(replaceLine('Nim', 3, 'Nimjia')).toEqual({ text: 'Nimjia', caret: 6 });
  });
});
