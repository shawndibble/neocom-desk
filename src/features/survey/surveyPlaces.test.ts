import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';
import {
  foldPlaceName,
  manualPlaceOption,
  matchesPlace,
  rankExactFirst,
  searchCachedStructures,
  searchLocalPlaces,
  searchStructures,
  structureSearchTerms,
} from './surveyPlaces';

const { getCharacterSearch, loadStructureSummary, listCachedStructures } = vi.hoisted(() => ({
  getCharacterSearch: vi.fn(),
  loadStructureSummary: vi.fn(),
  listCachedStructures: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({ getCharacterSearch }));
vi.mock('@/features/character/structures', () => ({ loadStructureSummary, listCachedStructures }));

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

describe('foldPlaceName', () => {
  it('ignores case, apostrophes, dashes and other punctuation', () => {
    expect(foldPlaceName("  Ainsan - Mav's Watering Hole ")).toBe('ainsan mavs watering hole');
    expect(foldPlaceName('Ainsan – Mav’s  Watering-Hole')).toBe('ainsan mavs watering hole');
  });

  it('drops accents', () => {
    expect(foldPlaceName('Café Ørbit')).toBe('cafe ørbit');
  });
});

describe('matchesPlace', () => {
  const name = "Ainsan - Mav's Watering Hole";

  it('matches the full pasted name and its punctuation-free spellings', () => {
    expect(matchesPlace(name, name)).toBe(true);
    expect(matchesPlace(name, 'ainsan mavs watering hole')).toBe(true);
    expect(matchesPlace(name, 'Ainsan - Mav')).toBe(true);
  });

  it('matches every typed word as the start of a word in the name, in any order', () => {
    expect(matchesPlace(name, 'mav wat')).toBe(true);
    expect(matchesPlace(name, 'hole ains')).toBe(true);
  });

  it('refuses a word the name does not carry', () => {
    expect(matchesPlace(name, 'ainsan refinery')).toBe(false);
    expect(matchesPlace(name, '')).toBe(false);
  });
});

describe('structureSearchTerms', () => {
  it('tries what was typed, then without punctuation, then the name after the system', () => {
    expect(structureSearchTerms("Ainsan - Mav's Watering Hole")).toEqual([
      "Ainsan - Mav's Watering Hole",
      'Ainsan Mav Watering Hole',
      'Mav Watering Hole',
      'Ainsan',
    ]);
  });

  it('asks once for a plain word, and never below ESI floor', () => {
    expect(structureSearchTerms('  efa  ')).toEqual(['efa']);
    expect(structureSearchTerms('ef')).toEqual([]);
    expect(structureSearchTerms('Ef - Mo')).toEqual(['Ef - Mo', 'Ef Mo']);
  });
});

describe('rankExactFirst', () => {
  it('moves the places named exactly what was typed to the front, keeping the rest in order', () => {
    const places = [
      { id: 1, name: 'Ainsan', kind: 'system' as const },
      { id: 2, name: 'Ainsan - Mavs Watering Hole', kind: 'structure' as const },
      { id: 3, name: 'Ainsan - Refinery', kind: 'structure' as const },
    ];
    expect(rankExactFirst(places, "ainsan - mav's watering hole").map((p) => p.id)).toEqual([
      2, 1, 3,
    ]);
  });
});

describe('searchCachedStructures', () => {
  it('lists the structures this device already knows whose name matches, with no request', async () => {
    listCachedStructures.mockResolvedValue([
      { id: 1001, name: "Ainsan - Mav's Watering Hole" },
      { id: 1002, name: 'Ainsan - Refinery' },
    ]);
    const known = await searchCachedStructures();
    expect(known("ainsan - mav's watering")).toEqual([
      { id: 1001, name: "Ainsan - Mav's Watering Hole", kind: 'structure' },
    ]);
    expect(known('')).toEqual([]);
    expect(getCharacterSearch).not.toHaveBeenCalled();
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

  it('retries a looser query when ESI finds nothing for the pasted name', async () => {
    getCharacterSearch.mockImplementation(async (_c: number, _k: string[], term: string) => ({
      data: term === 'Ainsan Mav Watering Hole' ? { structure: [1001] } : {},
    }));
    loadStructureSummary.mockResolvedValue({ name: "Ainsan - Mav's Watering Hole" });
    expect(await searchStructures(7, "Ainsan - Mav's Watering Hole")).toEqual([
      { id: 1001, name: "Ainsan - Mav's Watering Hole", kind: 'structure' },
    ]);
    expect(getCharacterSearch.mock.calls.map((call) => call[2])).toEqual([
      "Ainsan - Mav's Watering Hole",
      'Ainsan Mav Watering Hole',
    ]);
  });

  it('keeps only the hits of a looser query that match the full name typed', async () => {
    getCharacterSearch.mockImplementation(async (_c: number, _k: string[], term: string) => ({
      data: term === 'Ainsan' ? { structure: [1001, 1002] } : {},
    }));
    loadStructureSummary.mockImplementation(async (_c: number, id: number) => ({
      name: id === 1001 ? "Ainsan - Mav's Watering Hole" : 'Ainsan - Refinery',
    }));
    expect(await searchStructures(7, "Ainsan - Mav's Watering Hole")).toEqual([
      { id: 1001, name: "Ainsan - Mav's Watering Hole", kind: 'structure' },
    ]);
  });

  it('stops retrying once aborted', async () => {
    const controller = new AbortController();
    getCharacterSearch.mockImplementation(async () => {
      controller.abort();
      return { data: {} };
    });
    expect(await searchStructures(7, "Ainsan - Mav's Watering Hole", controller.signal)).toEqual(
      []
    );
    expect(getCharacterSearch).toHaveBeenCalledOnce();
  });
});

describe('manualPlaceOption', () => {
  const found = [{ id: 1, name: 'Jita', kind: 'system' as const }];
  it('offers what was typed as a manual place with no id', () => {
    expect(manualPlaceOption(found, '  Moro  ')).toEqual({
      id: null,
      name: 'Moro',
      kind: 'manual',
    });
  });
  it('offers nothing for an empty box or a name a result already carries', () => {
    expect(manualPlaceOption(found, '  ')).toBeNull();
    expect(manualPlaceOption(found, 'jita')).toBeNull();
    expect(manualPlaceOption(found, ' Jita! ')).toBeNull();
  });
});
