import { describe, expect, it } from 'vitest';
import { rankKnownPlaces } from './placeSearch';

const stations = [
  { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 },
  { id: 60008494, name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: 30002187 },
  { id: 60003757, name: 'Jita IV - Moon 4 - Caldari Business Tribunal', systemId: 30000142 },
];
const structures = [{ id: 1035466617946, name: 'Jita - Keepstar Annex' }];

describe('rankKnownPlaces', () => {
  it('finds a station by name', () => {
    const hits = rankKnownPlaces('Jita IV', stations, structures, 10);
    expect(hits.map((hit) => hit.id)).toEqual([60003757, 60003760]);
    expect(hits.every((hit) => hit.kind === 'station')).toBe(true);
  });

  it('marks a known structure as a structure', () => {
    expect(rankKnownPlaces('keepstar', stations, structures, 10)).toEqual([
      { kind: 'structure', id: 1035466617946, name: 'Jita - Keepstar Annex', systemId: null },
    ]);
  });

  it('carries the station system', () => {
    expect(rankKnownPlaces('amarr', stations, structures, 10)[0]).toMatchObject({
      kind: 'station',
      systemId: 30002187,
    });
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(rankKnownPlaces('  ', stations, structures, 10)).toEqual([]);
    expect(rankKnownPlaces('jita', stations, structures, 2)).toHaveLength(2);
  });
});
