import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolvePayeeName,
  searchPayeeEntities,
  searchPayeeEntitiesPublic,
} from './payeeEntitySearch';

const mocks = vi.hoisted(() => ({
  searchZkillEntities: vi.fn(),
  getCharacterSearch: vi.fn(),
  postUniverseIds: vi.fn(),
  resolveNames: vi.fn(),
}));
vi.mock('@/esi/endpoints', () => ({
  getCharacterSearch: mocks.getCharacterSearch,
  postUniverseIds: mocks.postUniverseIds,
}));
vi.mock('@/lib/zkillboard', () => ({ searchZkillEntities: mocks.searchZkillEntities }));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));

beforeEach(() => vi.clearAllMocks());

describe('searchPayeeEntities', () => {
  it('does not call ESI under three characters', async () => {
    expect(await searchPayeeEntities(1, ' ab ')).toEqual([]);
    expect(mocks.getCharacterSearch).not.toHaveBeenCalled();
  });

  it('searches all three categories and labels each hit with its kind', async () => {
    mocks.getCharacterSearch.mockResolvedValue({
      data: { character: [1], corporation: [2], alliance: [3] },
    });
    mocks.resolveNames.mockResolvedValue(
      new Map([
        [1, 'Moon Pilot'],
        [2, 'Moon Corp'],
        [3, 'Moon Alliance'],
      ])
    );

    const hits = await searchPayeeEntities(7, 'moon');

    expect(mocks.getCharacterSearch).toHaveBeenCalledWith(
      7,
      ['character', 'corporation', 'alliance'],
      'moon',
      { signal: undefined }
    );
    expect(hits).toEqual([
      { id: 2, name: 'Moon Corp', kind: 'corporation' },
      { id: 1, name: 'Moon Pilot', kind: 'character' },
      { id: 3, name: 'Moon Alliance', kind: 'alliance' },
    ]);
  });

  it('caps the list and drops ids with no resolvable name', async () => {
    mocks.getCharacterSearch.mockResolvedValue({
      data: { character: Array.from({ length: 30 }, (_, i) => i + 1) },
    });
    mocks.resolveNames.mockImplementation(async (ids: number[]) => {
      return new Map(ids.filter((id) => id !== 1).map((id) => [id, `P${id}`]));
    });

    const hits = await searchPayeeEntities(7, 'pilot');

    expect(hits.length).toBeLessThanOrEqual(15);
    expect(hits.find((h) => h.id === 1)).toBeUndefined();
  });

  it('returns nothing when ESI has no data', async () => {
    mocks.getCharacterSearch.mockResolvedValue({ data: null });
    expect(await searchPayeeEntities(7, 'nothing')).toEqual([]);
  });
});

describe('resolvePayeeName', () => {
  it('returns every exact match with its kind', async () => {
    mocks.postUniverseIds.mockResolvedValue({
      characters: [{ id: 1, name: 'Foo' }],
      corporations: [{ id: 2, name: 'Foo' }],
    });
    expect(await resolvePayeeName('  Foo ')).toEqual([
      { id: 2, name: 'Foo', kind: 'corporation' },
      { id: 1, name: 'Foo', kind: 'character' },
    ]);
    expect(mocks.postUniverseIds).toHaveBeenCalledWith(['Foo'], { signal: undefined });
  });

  it('returns an empty list for a label ESI does not know, and never calls for blank', async () => {
    mocks.postUniverseIds.mockResolvedValue({});
    expect(await resolvePayeeName('Moon 1 Planet 2')).toEqual([]);
    expect(await resolvePayeeName('  ')).toEqual([]);
    expect(mocks.postUniverseIds).toHaveBeenCalledTimes(1);
  });
});

describe('searchPayeeEntitiesPublic', () => {
  it('does not ask under three characters', async () => {
    expect(await searchPayeeEntitiesPublic('st')).toEqual([]);
    expect(mocks.searchZkillEntities).not.toHaveBeenCalled();
  });

  it('lists the exact-name match first, then zKillboard’s partial matches, each once', async () => {
    mocks.postUniverseIds.mockResolvedValue({ corporations: [{ id: 2, name: 'Star Tail' }] });
    mocks.searchZkillEntities.mockResolvedValue([
      { id: 9, name: 'Star Tail Industuries', kind: 'corporation' },
      { id: 2, name: 'Star Tail', kind: 'corporation' },
    ]);
    const hits = await searchPayeeEntitiesPublic('Star Tail');
    expect(hits.map((h) => h.id)).toEqual([2, 9]);
  });

  it('still gives the other half when one fails', async () => {
    mocks.postUniverseIds.mockRejectedValue(new Error('down'));
    mocks.searchZkillEntities.mockResolvedValue([
      { id: 9, name: 'Star Tail Industuries', kind: 'corporation' },
    ]);
    expect(await searchPayeeEntitiesPublic('Star Tail In')).toHaveLength(1);
  });
});
