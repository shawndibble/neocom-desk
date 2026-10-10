import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import { searchLocalPlaces, searchStructures } from './surveyPlaces';

const { getCharacterSearch, loadStructureSummary } = vi.hoisted(() => ({
  getCharacterSearch: vi.fn(),
  loadStructureSummary: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({ getCharacterSearch }));
vi.mock('@/features/character/structures', () => ({ loadStructureSummary }));

const system = (id: number, name: string, security = 0.4): SolarSystemEntry => ({
  id,
  name,
  security,
  regionId: 1,
});
const station = (id: number, name: string): NpcStationEntry => ({ id, name, systemId: 1 });

describe('searchLocalPlaces', () => {
  const systems = [system(30002, 'Efa'), system(30003, 'Defan'), system(30004, 'Jita', 0.9)];
  const stations = [station(60001, 'Efa VI - Moon 9 - Sisters of EVE Bureau')];

  it('lists matching systems before stations, each tagged with what it is', () => {
    expect(searchLocalPlaces(systems, stations, 'efa')).toEqual([
      { id: 30002, name: 'Efa', kind: 'system', security: 0.4 },
      { id: 30003, name: 'Defan', kind: 'system', security: 0.4 },
      { id: 60001, name: 'Efa VI - Moon 9 - Sisters of EVE Bureau', kind: 'station' },
    ]);
  });

  it('is empty for an empty query', () => {
    expect(searchLocalPlaces(systems, stations, '')).toEqual([]);
  });
});

describe('searchStructures', () => {
  beforeEach(() => {
    getCharacterSearch.mockReset();
    loadStructureSummary.mockReset();
  });

  it('makes no request below ESI search floor', async () => {
    expect(await searchStructures(7, 'ef')).toEqual([]);
    expect(getCharacterSearch).not.toHaveBeenCalled();
  });

  it('resolves each hit to a named structure, dropping ones it cannot see', async () => {
    getCharacterSearch.mockResolvedValue({ data: { structure: [1001, 1002] } });
    loadStructureSummary.mockImplementation(async (_c: number, id: number) =>
      id === 1001 ? { name: 'Efa - Refinery', systemId: 30002, typeId: 35835 } : null
    );
    expect(await searchStructures(7, 'efa')).toEqual([
      { id: 1001, name: 'Efa - Refinery', kind: 'structure' },
    ]);
    expect(getCharacterSearch).toHaveBeenCalledWith(7, ['structure'], 'efa', { signal: undefined });
  });
});
