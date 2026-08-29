import { describe, it, expect } from 'vitest';
import { typeIconUrl, stripEveMarkup } from './typeDisplay';

describe('typeIconUrl', () => {
  it('builds the EVE image server icon URL', () => {
    expect(typeIconUrl(9899)).toBe('https://images.evetech.net/types/9899/icon?size=64');
    expect(typeIconUrl(9899, 32)).toBe('https://images.evetech.net/types/9899/icon?size=32');
  });
});

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
});
