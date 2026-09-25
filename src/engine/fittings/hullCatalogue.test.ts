import { describe, expect, it } from 'vitest';
import { buildHullCatalogue, searchHulls } from './hullCatalogue';

const groups = [
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 8, name: 'Cruisers', parentId: 4, hasTypes: false },
  { id: 80, name: 'Standard Cruisers', parentId: 8, hasTypes: false },
  { id: 801, name: 'Gallente', parentId: 80, hasTypes: true },
  { id: 81, name: 'Advanced Cruisers', parentId: 8, hasTypes: false },
  { id: 811, name: 'Heavy Assault Cruisers', parentId: 81, hasTypes: true },
  { id: 5, name: 'Frigates', parentId: 4, hasTypes: false },
  { id: 51, name: 'Standard Frigates', parentId: 5, hasTypes: false },
  { id: 511, name: 'Gallente', parentId: 51, hasTypes: true },
  { id: 9, name: 'Ship Equipment', parentId: null, hasTypes: false },
  { id: 91, name: 'Afterburners', parentId: 9, hasTypes: true },
];

const types = [
  { typeId: 626, name: 'Vexor', marketGroupId: 801 },
  { typeId: 17843, name: 'Vexor Navy Issue', marketGroupId: 801 },
  { typeId: 12005, name: 'Ishtar', marketGroupId: 811 },
  { typeId: 593, name: 'Tristan', marketGroupId: 511 },
  { typeId: 12056, name: '10MN Afterburner II', marketGroupId: 91 },
];

describe('buildHullCatalogue', () => {
  const catalogue = buildHullCatalogue(groups, types);

  it('lists only hulls under Ships, by class, smallest class first', () => {
    expect(catalogue.map((c) => c.name)).toEqual(['Frigates', 'Cruisers']);
    expect(catalogue.flatMap((c) => c.hulls.map((h) => h.name))).not.toContain(
      '10MN Afterburner II'
    );
  });

  it('sorts a class’s hulls by name and names the group each sits in', () => {
    const cruisers = catalogue.find((c) => c.name === 'Cruisers')!;
    expect(cruisers.hulls).toEqual([
      { typeId: 12005, name: 'Ishtar', group: 'Advanced Cruisers · Heavy Assault Cruisers' },
      { typeId: 626, name: 'Vexor', group: 'Standard Cruisers · Gallente' },
      { typeId: 17843, name: 'Vexor Navy Issue', group: 'Standard Cruisers · Gallente' },
    ]);
  });

  it('is empty when the market data has no Ships branch', () => {
    expect(buildHullCatalogue(groups.slice(9), types)).toEqual([]);
  });
});

describe('searchHulls', () => {
  const catalogue = buildHullCatalogue(groups, types);

  it('matches every word of the query against the name or the group', () => {
    const names = (q: string) =>
      searchHulls(catalogue, q).flatMap((c) => c.hulls.map((h) => h.name));
    expect(names('vexor navy')).toEqual(['Vexor Navy Issue']);
    expect(names('heavy assault')).toEqual(['Ishtar']);
    expect(names('GALLENTE')).toEqual(['Tristan', 'Vexor', 'Vexor Navy Issue']);
  });

  it('drops a class with nothing left, and returns everything for a blank query', () => {
    expect(searchHulls(catalogue, 'ishtar').map((c) => c.name)).toEqual(['Cruisers']);
    expect(searchHulls(catalogue, '  ')).toBe(catalogue);
  });
});
