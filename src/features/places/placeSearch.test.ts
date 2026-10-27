import { describe, expect, it, vi } from 'vitest';
import { rankKnownPlaces, searchKnownPlaces } from './placeSearch';

const visible = vi.hoisted(() => vi.fn());
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: async () => [] }));
vi.mock('@/features/character/stations', () => ({ loadStationSummary: vi.fn() }));
vi.mock('@/features/character/structures', () => ({
  listCachedStructures: async () => [
    { id: 1, name: 'Seen Keepstar' },
    { id: 2, name: 'Hidden Keepstar' },
  ],
  loadStructureSummary: vi.fn(),
  loadVisibleStructure: (_characterId: number, id: number) => visible(id),
}));

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

describe('searchKnownPlaces', () => {
  it('drops a cached structure this Character cannot see, and takes the name from its own lookup', async () => {
    visible.mockImplementation(async (id: number) =>
      id === 1 ? { name: 'Seen Keepstar', systemId: 30000142 } : null
    );
    expect(await searchKnownPlaces(91, 'keepstar', 10)).toEqual([
      { kind: 'structure', id: 1, name: 'Seen Keepstar', systemId: 30000142 },
    ]);
  });

  it('offers no structure with no Character', async () => {
    expect(await searchKnownPlaces(null, 'keepstar', 10)).toEqual([]);
  });
});
