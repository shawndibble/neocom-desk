import { describe, it, expect } from 'vitest';
import { rankedSearch } from './rankedSearch';

interface Row {
  name: string;
  groupName: string;
}

const byName = (r: Row) => r.name;
const byGroup = (r: Row) => r.groupName;

describe('rankedSearch', () => {
  it('returns [] for an empty query', () => {
    const rows: Row[] = [{ name: 'Widget', groupName: 'Gadgets' }];
    expect(rankedSearch(rows, '', { primary: byName, limit: 50 })).toEqual([]);
  });

  it('returns [] for a whitespace-only query', () => {
    const rows: Row[] = [{ name: 'Widget', groupName: 'Gadgets' }];
    expect(rankedSearch(rows, '   ', { primary: byName, limit: 50 })).toEqual([]);
  });

  it('ranks exact > prefix > substring on the primary field', () => {
    const rows: Row[] = [
      { name: 'A Substring Frigate', groupName: '' },
      { name: 'Frigate Prefix', groupName: '' },
      { name: 'Frigate', groupName: '' },
    ];
    const result = rankedSearch(rows, 'frigate', { primary: byName, limit: 50 });
    expect(result.map((r) => r.name)).toEqual(['Frigate', 'Frigate Prefix', 'A Substring Frigate']);
  });

  it('is alphabetical by primary field within a rank', () => {
    const rows: Row[] = [
      { name: 'Zzz Widget', groupName: '' },
      { name: 'Aaa Widget', groupName: '' },
      { name: 'Mmm Widget', groupName: '' },
    ];
    const result = rankedSearch(rows, 'widget', { primary: byName, limit: 50 });
    expect(result.map((r) => r.name)).toEqual(['Aaa Widget', 'Mmm Widget', 'Zzz Widget']);
  });

  it('respects the limit, applied after sorting (not before)', () => {
    const rows: Row[] = [
      ...Array.from({ length: 60 }, (_, i) => ({
        name: `Aa Widget ${String(i).padStart(2, '0')}`,
        groupName: '',
      })),
      { name: 'Zzz', groupName: '' },
    ];
    const result = rankedSearch(rows, 'zzz', { primary: byName, limit: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Zzz');
  });

  it('is case-insensitive', () => {
    const rows: Row[] = [{ name: 'WIDGET', groupName: '' }];
    expect(rankedSearch(rows, 'widget', { primary: byName, limit: 50 })).toEqual(rows);
  });

  it('a secondary-only match ranks below every primary match, including primary substring', () => {
    const rows: Row[] = [
      { name: 'Zzz Frigate', groupName: 'Ships' },
      { name: 'Aaa Cruiser', groupName: 'Frigate' },
    ];
    const result = rankedSearch(rows, 'frigate', {
      primary: byName,
      secondary: [byGroup],
      limit: 50,
    });
    expect(result.map((r) => r.name)).toEqual(['Zzz Frigate', 'Aaa Cruiser']);
  });

  it('matches on primary OR secondary field, without duplicating a row that matches both', () => {
    const rows: Row[] = [{ name: 'Frigate Hull', groupName: 'Frigate Skills' }];
    const result = rankedSearch(rows, 'frigate', {
      primary: byName,
      secondary: [byGroup],
      limit: 50,
    });
    expect(result).toHaveLength(1);
  });

  it('does not match a row whose secondary field matches but no secondary extractor was supplied', () => {
    const rows: Row[] = [{ name: 'Widget', groupName: 'Frigate' }];
    const result = rankedSearch(rows, 'frigate', { primary: byName, limit: 50 });
    expect(result).toEqual([]);
  });

  it('excludes rows that match neither primary nor any secondary field', () => {
    const rows: Row[] = [{ name: 'Widget', groupName: 'Gadgets' }];
    const result = rankedSearch(rows, 'zzz', { primary: byName, secondary: [byGroup], limit: 50 });
    expect(result).toEqual([]);
  });
});
