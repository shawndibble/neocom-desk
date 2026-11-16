import { describe, expect, it } from 'vitest';
import {
  effectiveSource,
  filterBySource,
  filterMyFittings,
  groupByHull,
  librarySources,
  type MyFittingRow,
} from './myFittings';

const row = (id: string, name: string, hull: string | null): MyFittingRow => ({ id, name, hull });

describe('groupByHull', () => {
  it('groups by hull alphabetically, entries by name, unknown hulls last', () => {
    const groups = groupByHull([
      row('1', 'Zed', 'Rifter'),
      row('2', 'Alpha', 'Rifter'),
      row('3', 'Bad', null),
      row('4', 'Solo', 'Drake'),
    ]);
    expect(groups.map((g) => g.hull)).toEqual(['Drake', 'Rifter', null]);
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('returns nothing for no rows', () => {
    expect(groupByHull([])).toEqual([]);
  });
});

describe('filterMyFittings', () => {
  const rows = [row('1', 'PvP kite', 'Rifter'), row('2', 'Missions', 'Drake')];

  it('matches the name or the hull, case-insensitively', () => {
    expect(filterMyFittings(rows, 'KITE').map((r) => r.id)).toEqual(['1']);
    expect(filterMyFittings(rows, 'drake').map((r) => r.id)).toEqual(['2']);
  });

  it('keeps everything for a blank query', () => {
    expect(filterMyFittings(rows, '  ')).toHaveLength(2);
  });
});

describe('library source filter', () => {
  const rows = [
    { id: 's', source: 'saved' },
    { id: 'g', source: 'inGame' },
    { id: 'a', source: 'active' },
    { id: 'd', source: 'doctrine' },
  ] as const;

  it('offers only the sources that have rows, in a fixed order, the Active Fitting as In-game', () => {
    expect(librarySources(rows)).toEqual(['saved', 'inGame', 'doctrine']);
    expect(librarySources([{ source: 'active' }, { source: 'shared' }])).toEqual([
      'inGame',
      'shared',
    ]);
    expect(librarySources([])).toEqual([]);
  });

  it('keeps every row under All sources', () => {
    expect(filterBySource(rows, 'all').map((r) => r.id)).toEqual(['s', 'g', 'a', 'd']);
  });

  it('keeps only rows of the picked source; the Active Fitting under In-game only', () => {
    expect(filterBySource(rows, 'saved').map((r) => r.id)).toEqual(['s']);
    expect(filterBySource(rows, 'inGame').map((r) => r.id)).toEqual(['g', 'a']);
    expect(filterBySource(rows, 'doctrine').map((r) => r.id)).toEqual(['d']);
    expect(filterBySource(rows, 'shared')).toEqual([]);
  });

  it('falls back to All sources when the picked source has no rows', () => {
    expect(effectiveSource('shared', ['saved', 'inGame'])).toBe('all');
    expect(effectiveSource('saved', ['saved', 'inGame'])).toBe('saved');
    expect(effectiveSource('all', ['saved'])).toBe('all');
  });
});
