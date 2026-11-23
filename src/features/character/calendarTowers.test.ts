import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = 98000001;
const B = 98000002;
const NOW = Date.parse('2026-11-12T08:00:00Z');
const accounts = vi.hoisted(() => [] as unknown[]);
const loadCorporationStarbases = vi.hoisted(() => vi.fn());
const loadStarbaseDetails = vi.hoisted(() => vi.fn());

vi.mock('@/features/corp/corpReadAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/corpReadAccess')>()),
  loadAccountCorpAccess: async () => accounts,
  // The tower read gates itself the same way the account list does.
  resolveCorpReadAccess: async (characterId: number) =>
    (accounts as { characterId: number; access: unknown }[]).find(
      (account) => account.characterId === characterId
    )?.access ?? null,
}));
vi.mock('@/features/corp/starbases', () => ({
  loadCorporationStarbases: (...a: unknown[]) => loadCorporationStarbases(...a),
  loadStarbaseDetails: (...a: unknown[]) => loadStarbaseDetails(...a),
}));
vi.mock('@/features/overview/data/corpBoard', () => ({
  startFeederChunks: async () => () => new Map(),
  loadMoonChunksBoardData: vi.fn(),
  loadStructuresBoardData: vi.fn(),
}));
vi.mock('@/features/corp/corpTicker', () => ({
  loadCorpLabels: async (ids: number[]) =>
    new Map(ids.map((id) => [id, { ticker: `T${id}`, name: `Corp ${id}` }])),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[12235, 'Caldari Control Tower']]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30000142, { name: 'Jita' }]]),
}));
vi.mock('@/features/character/names', () => ({ resolveNames: async () => new Map() }));

import { loadCorpCalendar } from './calendarCorpDeadlines';

const landed = <T>(data: T) => ({
  cached: { data, fetchedAt: new Date(NOW), fromCache: false },
  needsReauth: false,
});
const can = (capability: string) => capability === 'canReadStarbases';

beforeEach(() => {
  accounts.length = 0;
  loadCorporationStarbases.mockReset();
  loadStarbaseDetails.mockReset();
});

describe('Calendar: towers of every corporation the Characters read', () => {
  it('lists a tower’s fuel and reinforcement for each alt’s corporation, named by corporation', async () => {
    accounts.push(
      { characterId: 1, access: { corporationId: A, can } },
      { characterId: 2, access: { corporationId: B, can } }
    );
    loadCorporationStarbases.mockImplementation(async (characterId: number) =>
      landed([
        {
          starbase_id: characterId * 10,
          system_id: 30000142,
          type_id: 12235,
          state: 'online',
        },
        {
          starbase_id: characterId * 10 + 1,
          system_id: 30000142,
          type_id: 12235,
          state: 'reinforced',
          reinforced_until: new Date(NOW + 5 * 3_600_000).toISOString(),
        },
      ])
    );
    loadStarbaseDetails.mockResolvedValue(
      new Map([
        [10, landed({ fuels: [{ type_id: 4051, quantity: 400 }] })],
        [20, landed({ fuels: [{ type_id: 4051, quantity: 400 }] })],
      ])
    );

    const read = await loadCorpCalendar(NOW);

    expect(read.structureFuel).toHaveLength(2);
    expect(read.structureFuel!.map((f) => f.corporation?.id).sort()).toEqual([A, B]);
    expect(read.structureTimers).toHaveLength(2);
    expect(read.corporations.map((c) => c.id).sort()).toEqual([A, B]);
  });

  it('reads nothing for a pilot whose Characters cannot read towers', async () => {
    accounts.push({ characterId: 1, access: { corporationId: A, can: () => false } });
    const read = await loadCorpCalendar(NOW);
    expect(read.structureFuel).toBeUndefined();
    expect(loadCorporationStarbases).not.toHaveBeenCalled();
  });
});
