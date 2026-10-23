import { describe, expect, it } from 'vitest';
import type { TypeMap } from '@/sde/types';
import { buildHullCatalog, searchHulls } from './hullCatalog';

const types: TypeMap = {
  '626': { name: 'Vexor', groupID: 26, volume: 1 },
  '627': { name: 'Thorax', groupID: 26, volume: 1 },
  '641': { name: 'Megathron', groupID: 27, volume: 1 },
  '18': { name: 'Plagioclase', groupID: 458, volume: 1 },
  '999': { name: 'Rifter', groupID: 25, volume: 1 },
};
const categories = { '25': 6, '26': 6, '27': 6, '458': 25 };

describe('hullCatalog', () => {
  it('lists only ship hulls, grouped by their ship group', () => {
    const c = buildHullCatalog(types, categories);
    expect(c.classIds.sort((a, b) => a - b)).toEqual([25, 26, 27]);
    expect(c.hullsByClass.get(26)?.map((h) => h.name)).toEqual(['Thorax', 'Vexor']);
    expect(c.hull(641)).toEqual({ id: 641, name: 'Megathron', classId: 27 });
    expect(c.hull(18)).toBeUndefined();
  });

  it('searches by name, case-insensitively, nothing for a blank query', () => {
    const c = buildHullCatalog(types, categories);
    expect(searchHulls(c, ' ')).toEqual([]);
    expect(searchHulls(c, 'THOR').map((h) => h.id)).toEqual([627]);
    expect(searchHulls(c, 'o').map((h) => h.name)).toEqual(['Megathron', 'Thorax', 'Vexor']);
  });
});
