import { describe, expect, it } from 'vitest';
import { editDistance, fuzzySearch } from './fuzzySearch';

const names = [
  'Rocket Launcher',
  'Light Missile Launcher',
  'Rocket Fuel',
  'Tritanium',
  'Rifter',
  'Caldari Navy Antimatter Charge',
];
const search = (query: string, limit = 50) =>
  fuzzySearch(names, query, { primary: (name) => name, limit });

describe('editDistance', () => {
  it('counts insert, delete, substitute and adjacent swap as one edit', () => {
    expect(editDistance('rocket', 'rocket')).toBe(0);
    expect(editDistance('rockt', 'rocket')).toBe(1);
    expect(editDistance('rocckett', 'rocket')).toBe(2);
    expect(editDistance('rokcet', 'rocket')).toBe(1);
    expect(editDistance('rucket', 'rocket')).toBe(1);
  });
});

describe('fuzzySearch', () => {
  it('finds a word with a dropped letter', () => {
    expect(search('rockt')).toEqual(['Rocket Fuel', 'Rocket Launcher']);
  });

  it('finds a word with two letters swapped', () => {
    expect(search('tritanuim')).toEqual(['Tritanium']);
  });

  it('forgives a typo in a half-typed word', () => {
    expect(search('rokcet l')[0]).toBe('Rocket Launcher');
    expect(search('tritan')).toEqual(['Tritanium']);
  });

  it('finds a typo in the middle of a longer query', () => {
    expect(search('antimater')).toEqual(['Caldari Navy Antimatter Charge']);
  });

  it('ranks the closer match first, then alphabetical', () => {
    expect(search('riftor')).toEqual(['Rifter']);
    expect(search('rocket fual')).toEqual(['Rocket Fuel', 'Rocket Launcher']);
  });

  it('returns nothing for gibberish and for an empty query', () => {
    expect(search('zzzzzz')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('forgives nothing in a three-letter query, which would match too much', () => {
    expect(search('rix')).toEqual([]);
  });

  it('gives up on a query longer than any item name', () => {
    expect(search('rocket launcher'.repeat(4))).toEqual([]);
  });

  it('honours the limit', () => {
    expect(search('rockt', 1)).toEqual(['Rocket Fuel']);
  });
});
