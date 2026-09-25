import { describe, expect, it } from 'vitest';
import { filterMyFittings, groupByHull, type MyFittingRow } from './myFittings';

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
