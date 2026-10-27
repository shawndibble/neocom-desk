import { describe, it, expect } from 'vitest';
import { stripEveMarkup } from './typeDisplay';

describe('stripEveMarkup', () => {
  it('removes EVE markup tags', () => {
    expect(stripEveMarkup('A basic <b>ocular filter</b> implant.')).toBe(
      'A basic ocular filter implant.'
    );
  });

  it('removes showinfo links, keeping their text', () => {
    expect(stripEveMarkup('See <a href="showinfo:9899">this</a> implant.')).toBe(
      'See this implant.'
    );
  });

  it('decodes common HTML entities', () => {
    expect(stripEveMarkup('Tank &amp; gank')).toBe('Tank & gank');
  });

  it('trims surrounding whitespace', () => {
    expect(stripEveMarkup('  <b>Hello</b>  ')).toBe('Hello');
  });

  it('does not double-decode: a literal &lt; that only appears after &amp; is decoded stays literal (BUG #4)', () => {
    // "&amp;lt;" first decodes (as &amp;) to the literal text "&lt;" — that
    // must not then be decoded a second time into "<". Entities present in
    // the raw string decode once each, in a single pass.
    expect(stripEveMarkup('5 &amp;lt; 10')).toBe('5 &lt; 10');
  });

  it('converts <br> variants to newlines before stripping other tags', () => {
    expect(stripEveMarkup('Line one<br>Line two<br/>Line three<br />Line four')).toBe(
      'Line one\nLine two\nLine three\nLine four'
    );
  });
});
