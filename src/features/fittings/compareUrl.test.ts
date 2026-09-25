import { describe, expect, it } from 'vitest';
import { parseCompareCodes, writeCompareCodes } from './compareUrl';

describe('parseCompareCodes', () => {
  it('reads every f value in order', () => {
    const params = new URLSearchParams('f=aaa&f=bbb');
    expect(parseCompareCodes(params)).toEqual(['aaa', 'bbb']);
  });

  it('drops empty values', () => {
    const params = new URLSearchParams('f=aaa&f=&f=bbb');
    expect(parseCompareCodes(params)).toEqual(['aaa', 'bbb']);
  });

  it('caps at 3', () => {
    const params = new URLSearchParams('f=a&f=b&f=c&f=d');
    expect(parseCompareCodes(params)).toEqual(['a', 'b', 'c']);
  });

  it('reads no key as an empty list', () => {
    expect(parseCompareCodes(new URLSearchParams(''))).toEqual([]);
  });
});

describe('writeCompareCodes', () => {
  it('replaces every f with the new codes', () => {
    const params = new URLSearchParams('f=old1&f=old2&other=1');
    const next = writeCompareCodes(params, ['new1', 'new2']);
    expect(next.getAll('f')).toEqual(['new1', 'new2']);
    expect(next.get('other')).toBe('1');
  });

  it('leaves every other key untouched', () => {
    const params = new URLSearchParams('f=a&sort=name:asc');
    const next = writeCompareCodes(params, ['b']);
    expect(next.get('sort')).toBe('name:asc');
  });

  it('drops empty codes and caps at 3', () => {
    const next = writeCompareCodes(new URLSearchParams(''), ['a', '', 'b', 'c', 'd']);
    expect(next.getAll('f')).toEqual(['a', 'b', 'c']);
  });

  it('clears f entirely when given no codes', () => {
    const next = writeCompareCodes(new URLSearchParams('f=a'), []);
    expect(next.getAll('f')).toEqual([]);
  });
});
