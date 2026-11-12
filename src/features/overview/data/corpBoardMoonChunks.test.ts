import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoonChunksBoardData } from './boardData';

interface Gate {
  corporationId: number;
  can: (c: string) => boolean;
  viewsTaxBook?: boolean;
}
const characters = vi.hoisted(() => [] as number[]);
const access = vi.hoisted(() => new Map<number, Gate>());
const esiChunks = vi.hoisted(() => new Map<number, unknown>());
const loadBookMoonChunks = vi.hoisted(() => vi.fn());

vi.mock('@/features/corp/corpReadAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/corp/corpReadAccess')>();
  const accounts = () =>
    characters.flatMap((characterId) => {
      const gate = access.get(characterId);
      return gate ? [{ characterId, access: gate }] : [];
    });
  return {
    ...actual,
    resolveCorpReadAccess: async (characterId: number) => access.get(characterId) ?? null,
    loadAccountCorpAccess: async () => accounts(),
  };
});
vi.mock('@/features/corp/corpTicker', () => ({ loadCorpLabels: async () => new Map() }));
vi.mock('@/features/corp/boardData', () => ({ loadCorporationStructures: vi.fn() }));
vi.mock('@/features/corp/boardSources', () => ({ toBoardStructures: vi.fn() }));
vi.mock('@/features/character/calendarMoonChunks', () => ({
  loadMoonChunks: async (characterId: number) => {
    const corp = access.get(characterId)?.corporationId ?? 0;
    const read = esiChunks.get(corp);
    if (read === 'fail') return { result: { cached: null, needsReauth: false }, failed: true };
    return read ?? { result: { cached: null, needsReauth: false }, sources: undefined };
  },
}));
vi.mock('@/features/corp/taxBook/bookMoonChunks', () => ({ loadBookMoonChunks }));

import { loadAllMoonChunksBoardData, loadMoonChunksWithBook } from './corpBoard';

const AT = new Date('2026-11-12T08:00:00Z');
const clock = (id: string) => ({ id, subject: `Refinery ${id}`, detail: 'arrival', deadlineMs: 1 });
const esiRead = (id: string) => ({
  result: { cached: { data: [], fetchedAt: AT }, needsReauth: false },
  sources: [clock(id)],
  extractions: [],
});
const bookRead = (id: string): MoonChunksBoardData => ({
  chunks: [clock(id)] as MoonChunksBoardData['chunks'],
  extractions: [],
  needsReauth: false,
  fetchedAt: AT,
  loadedAt: 0,
});
const only = (cap: string) => (c: string) => c === cap;

beforeEach(() => {
  characters.length = 0;
  access.clear();
  esiChunks.clear();
  loadBookMoonChunks.mockReset().mockResolvedValue(new Map());
});

describe("moon owners' pops from a Corp Tax Book (#6116)", () => {
  it('All characters: adds the book’s moon owners beside the corporations ESI reads', async () => {
    characters.push(1, 2);
    access.set(1, { corporationId: 10, can: only('canReadMoonExtractions') });
    // The CEO of the accounting corporation: views its book, no refinery of its own.
    access.set(2, { corporationId: 20, can: () => false, viewsTaxBook: true });
    esiChunks.set(10, esiRead('own'));
    loadBookMoonChunks.mockResolvedValue(new Map([[30, bookRead('moon-owner')]]));

    const merged = await loadAllMoonChunksBoardData();

    expect(merged.chunks?.map((c) => c.id)).toEqual(['own', 'moon-owner']);
    const [accounts, esi] = loadBookMoonChunks.mock.calls[0];
    expect(accounts).toHaveLength(2);
    expect([...esi]).toEqual([10]);
  });

  it('All characters: a book still answers when every ESI read failed', async () => {
    characters.push(1);
    access.set(1, { corporationId: 10, can: only('canReadMoonExtractions'), viewsTaxBook: true });
    esiChunks.set(10, 'fail');
    loadBookMoonChunks.mockResolvedValue(new Map([[30, bookRead('moon-owner')]]));
    expect((await loadAllMoonChunksBoardData()).chunks?.map((c) => c.id)).toEqual(['moon-owner']);
  });

  it('All characters: no book asked for when no Character views one', async () => {
    characters.push(1);
    access.set(1, { corporationId: 10, can: only('canReadMoonExtractions') });
    esiChunks.set(10, esiRead('own'));
    await loadAllMoonChunksBoardData();
    expect(loadBookMoonChunks).not.toHaveBeenCalled();
  });

  it("one Character: its book's moon owners join its own corporation's drills", async () => {
    characters.push(2);
    access.set(2, { corporationId: 20, can: () => false, viewsTaxBook: true });
    loadBookMoonChunks.mockResolvedValue(new Map([[30, bookRead('moon-owner')]]));
    const read = await loadMoonChunksWithBook(2);
    expect(read.chunks?.map((c) => c.id)).toEqual(['moon-owner']);
    expect([...loadBookMoonChunks.mock.calls[0][1]]).toEqual([20]);
  });

  it('one Character: a book that fails to load leaves its own read as it was', async () => {
    characters.push(1);
    access.set(1, { corporationId: 10, can: only('canReadMoonExtractions'), viewsTaxBook: true });
    esiChunks.set(10, esiRead('own'));
    loadBookMoonChunks.mockRejectedValue(new Error('offline'));
    expect((await loadMoonChunksWithBook(1)).chunks?.map((c) => c.id)).toEqual(['own']);
  });
});
