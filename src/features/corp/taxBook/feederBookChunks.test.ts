import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncExtraction } from '@/engine/corpTaxBook/sync';

const readFeederChunkParts = vi.hoisted(() => vi.fn());
vi.mock('./bookClient', () => ({ readFeederChunkParts }));

import { clearFeederBookReads, feederChunkReads, readFeederBooks } from './feederBookChunks';

const NOW = Date.parse('2026-11-12T08:00:00Z');
const chunk = (structureId: number, owner: number): SyncExtraction => ({
  structureId,
  moonId: 40000000 + structureId,
  extractionStartTime: '2026-11-01T00:00:00.000Z',
  chunkArrivalTime: '2026-11-15T00:00:00.000Z',
  naturalDecayTime: '2026-11-15T03:00:00.000Z',
  sourceCorporationId: owner,
});
const viewer = (characterId: number, corporationId: number, viewsTaxBook = true) => ({
  characterId,
  access: { corporationId, can: () => false, viewsTaxBook },
});

beforeEach(() => {
  clearFeederBookReads();
  readFeederChunkParts.mockReset();
});

describe('Feeder pops from Corp Tax Books', () => {
  it('reads each book once, through the preferred viewer, and keeps what ESI already reads out', async () => {
    readFeederChunkParts.mockResolvedValue({
      extractions: [chunk(7001, 30), chunk(7002, 31)],
      feeders: [{ corporationId: 30, lastReadWellAt: NOW - 3_600_000 }],
    });
    const books = await readFeederBooks(
      [viewer(1, 20), viewer(2, 20), viewer(3, 40, false)],
      2,
      NOW
    );
    expect(readFeederChunkParts.mock.calls).toEqual([[2, 20]]);
    const out = feederChunkReads(books, new Set([31]), NOW);
    expect([...out.keys()]).toEqual([30]);
    expect(out.get(30)).toMatchObject({
      chunks: [{ id: '7001', detail: 'arrival' }],
      fromBook: true,
      // The Data Age is the book's last read of that Feeder, not this load.
      fetchedAt: new Date(NOW - 3_600_000),
    });
  });

  it('leaves out a book that fails or does not exist, while another answers', async () => {
    readFeederChunkParts.mockImplementation(async (_c: number, corp: number) => {
      if (corp === 20) throw new Error('permission-denied');
      if (corp === 21) return null;
      return { extractions: [chunk(7001, 30)], feeders: [] };
    });
    const books = await readFeederBooks(
      [viewer(1, 20), viewer(2, 21), viewer(3, 22)],
      undefined,
      NOW
    );
    expect([...feederChunkReads(books, new Set(), NOW).keys()]).toEqual([30]);
  });

  it('reuses a read for five minutes, a refusal too, and "no book" for an hour', async () => {
    readFeederChunkParts.mockImplementation(async (_c: number, corp: number) => {
      if (corp === 20) throw new Error('permission-denied');
      if (corp === 21) return null;
      return { extractions: [], feeders: [] };
    });
    const accounts = [viewer(1, 20), viewer(2, 21), viewer(3, 22)];
    await readFeederBooks(accounts, undefined, NOW);
    await readFeederBooks(accounts, undefined, NOW + 60_000);
    expect(readFeederChunkParts).toHaveBeenCalledTimes(3);
    await readFeederBooks(accounts, undefined, NOW + 6 * 60_000);
    // The refused and the readable book are asked again; the one with no book is not.
    expect(readFeederChunkParts.mock.calls.slice(3).map(([, corp]) => corp)).toEqual([20, 22]);
  });

  it('reads nothing for Characters that view no book', async () => {
    expect(await readFeederBooks([viewer(1, 20, false)], undefined, NOW)).toEqual([]);
    expect(readFeederChunkParts).not.toHaveBeenCalled();
  });
});
