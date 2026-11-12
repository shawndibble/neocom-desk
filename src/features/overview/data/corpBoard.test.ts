import { beforeEach, describe, expect, it, vi } from 'vitest';

const characters = vi.hoisted(() => [] as { characterId: number; name: string }[]);
const access = vi.hoisted(
  () => new Map<number, { corporationId: number; can: (c: string) => boolean }>()
);
const structuresByCorp = vi.hoisted(() => new Map<number, unknown>());

vi.mock('@/features/character/allCharactersFanOut', () => ({
  fanOutAllCharacters: async ({
    load,
  }: {
    load: (c: { characterId: number; name: string }) => Promise<unknown>;
  }) => {
    const entries: unknown[] = [];
    for (const character of characters) {
      const entry = await load(character);
      if (entry !== null) entries.push(entry);
    }
    return { entries, skipped: [] };
  },
}));
vi.mock('@/features/corp/corpReadAccess', () => ({
  resolveCorpReadAccess: async (characterId: number) => access.get(characterId) ?? null,
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

    expect(merged.structures?.map((s) => s.structureId)).toEqual([1, 2, 3]);
    expect(merged.structureCount).toBe(3);
    expect(merged.fetchedAt).toEqual(new Date('2026-11-01T09:00:00Z'));
  });

  it('keeps the corporations that answered when one fails, and asks for Retry only when all do', async () => {
    characters.push({ characterId: 1, name: 'A' }, { characterId: 3, name: 'C' });
    access.set(1, { corporationId: 10, can: canAll });
    access.set(3, { corporationId: 20, can: canAll });
    structuresByCorp.set(10, read([1], '2026-11-01T10:00:00Z'));
    structuresByCorp.set(20, { cached: null, needsReauth: false });
    expect((await loadAllStructuresBoardData()).structures).toHaveLength(1);

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
