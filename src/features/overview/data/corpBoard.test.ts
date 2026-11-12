import { beforeEach, describe, expect, it, vi } from 'vitest';

const characters = vi.hoisted(() => [] as { characterId: number; name: string }[]);
const access = vi.hoisted(
  () => new Map<number, { corporationId: number; can: (c: string) => boolean }>()
);
const structuresByCorp = vi.hoisted(() => new Map<number, unknown>());

vi.mock('@/features/corp/corpReadAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/corp/corpReadAccess')>();
  const accounts = () =>
    characters.flatMap(({ characterId }) => {
      const gate = access.get(characterId);
      return gate ? [{ characterId, access: gate }] : [];
    });
  return {
    ...actual,
    resolveCorpReadAccess: async (characterId: number) => access.get(characterId) ?? null,
    accountCorpReaders: async (capability: Parameters<typeof actual.corpReadersFor>[1]) =>
      actual.corpReadersFor(accounts(), capability),
  };
});
vi.mock('@/features/corp/corpTicker', () => ({
  loadCorpLabels: async (ids: number[]) =>
    new Map(ids.map((id) => [id, { ticker: `T${id}`, name: `Corp ${id}` }])),
}));
vi.mock('@/features/corp/boardData', () => ({
  loadCorporationStructures: async (_characterId: number, corporationId: number) =>
    structuresByCorp.get(corporationId),
}));
vi.mock('@/features/corp/boardSources', () => ({
  toBoardStructures: (rows: { id: number }[]) =>
    rows.map((row) => ({ structureId: row.id, name: `S${row.id}` })),
}));
vi.mock('@/features/character/calendarMoonChunks', () => ({ loadMoonChunks: vi.fn() }));

import { loadAllStructuresBoardData } from './corpBoard';

const canAll = () => true;
const read = (ids: number[], at: string) => ({
  cached: { data: ids.map((id) => ({ id })), fetchedAt: new Date(at) },
  needsReauth: false,
});

describe('loadAllStructuresBoardData', () => {
  beforeEach(() => {
    characters.length = 0;
    access.clear();
    structuresByCorp.clear();
  });

  it('merges every corporation, reads a shared corporation once, and skips one no role covers', async () => {
    characters.push(
      { characterId: 1, name: 'A' },
      { characterId: 2, name: 'B' },
      { characterId: 3, name: 'C' },
      { characterId: 4, name: 'D' }
    );
    access.set(1, { corporationId: 10, can: canAll });
    access.set(2, { corporationId: 10, can: canAll });
    access.set(3, { corporationId: 20, can: canAll });
    access.set(4, { corporationId: 30, can: () => false });
    structuresByCorp.set(10, read([1, 2], '2026-11-01T10:00:00Z'));
    structuresByCorp.set(20, read([3], '2026-11-01T09:00:00Z'));

    const merged = await loadAllStructuresBoardData();

    expect(merged.structures?.map((s) => [s.structureId, s.corporationId])).toEqual([
      [1, 10],
      [2, 10],
      [3, 20],
    ]);
    expect([...(merged.corporations?.keys() ?? [])]).toEqual([10, 20]);
    expect(merged.structureCount).toBe(3);
    expect(merged.fetchedAt).toEqual(new Date('2026-11-01T09:00:00Z'));
  });

  it('keeps the corporations that answered when one fails, and asks for Retry only when all do', async () => {
    characters.push({ characterId: 1, name: 'A' }, { characterId: 3, name: 'C' });
    access.set(1, { corporationId: 10, can: canAll });
    access.set(3, { corporationId: 20, can: canAll });
    structuresByCorp.set(10, read([1], '2026-11-01T10:00:00Z'));
    structuresByCorp.set(20, { cached: null, needsReauth: false });
    const partial = await loadAllStructuresBoardData();
    expect(partial.structures).toHaveLength(1);
    expect(partial.partlyFailed).toBe(true);

    structuresByCorp.set(10, { cached: null, needsReauth: false });
    await expect(loadAllStructuresBoardData()).rejects.toThrow();
  });

  it('is unreadable, not an error, when no Character can read structures', async () => {
    characters.push({ characterId: 4, name: 'D' });
    access.set(4, { corporationId: 30, can: () => false });
    const merged = await loadAllStructuresBoardData();
    expect(merged.structures).toBeNull();
    expect(merged.needsReauth).toBe(false);
  });
});
