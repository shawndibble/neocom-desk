import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoonChunksBoardData } from '@/features/overview/data/boardData';

const accounts = vi.hoisted(() => [] as unknown[]);
const feederChunks = vi.hoisted(() => vi.fn());
const loadMoonChunksBoardData = vi.hoisted(() => vi.fn());

vi.mock('@/features/corp/corpReadAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/corp/corpReadAccess')>()),
  loadAccountCorpAccess: async () => accounts,
}));
vi.mock('@/features/overview/data/corpBoard', () => ({
  startFeederChunks: async () => feederChunks,
  loadMoonChunksBoardData,
  loadStructuresBoardData: vi.fn(),
}));
vi.mock('@/features/corp/corpTicker', () => ({
  loadCorpLabels: async (ids: number[]) =>
    new Map(ids.map((id) => [id, { ticker: `T${id}`, name: `Corp ${id}` }])),
}));

import { loadCorpCalendar } from './calendarCorpDeadlines';

const NOW = Date.parse('2026-11-12T08:00:00Z');
const ARRIVES = Date.parse('2026-11-15T00:00:00Z');
const bookRead: MoonChunksBoardData = {
  chunks: [{ id: '7001', subject: 'Efa - Tatara', detail: 'arrival', deadlineMs: ARRIVES }],
  extractions: [
    {
      structureId: 7001,
      subject: 'Efa - Tatara',
      chunkArrivalMs: ARRIVES,
      naturalDecayMs: ARRIVES + 3 * 3_600_000,
    },
  ],
  needsReauth: false,
  fetchedAt: new Date(NOW),
  loadedAt: NOW,
};

beforeEach(() => {
  accounts.length = 0;
  feederChunks.mockReset().mockReturnValue(new Map());
  loadMoonChunksBoardData.mockReset();
});

describe("Calendar: moon owners' pops from a Corp Tax Book (#6116)", () => {
  it("shows a moon owner's coming chunk, named for its corporation, to a CEO with no refinery", async () => {
    // The accounting corporation's CEO: views the book, reads no corp source from ESI.
    accounts.push({
      characterId: 2,
      access: { corporationId: 20, can: (c: string) => c === 'canViewTaxBook' },
    });
    feederChunks.mockReturnValue(new Map([[30, bookRead]]));

    const read = await loadCorpCalendar(NOW);

    expect(read.moonChunks).toHaveLength(1);
    expect(read.moonChunks?.[0]).toMatchObject({
      deadlineMs: ARRIVES,
      corporation: { id: 30, name: 'Corp 30' },
    });
    expect(read.corporations.map((c) => c.name)).toEqual(['Corp 30']);
  });

  it('shows nothing new, and stays unreadable, for a pilot whose Characters view no book', async () => {
    accounts.push({ characterId: 1, access: { corporationId: 10, can: () => false } });
    const read = await loadCorpCalendar(NOW);
    expect(read.moonChunks).toBeUndefined();
  });
});
