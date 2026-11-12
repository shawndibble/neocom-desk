import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncExtraction } from '@/engine/corpTaxBook/sync';

const readMoonOwnerChunkParts = vi.hoisted(() => vi.fn());
vi.mock('./bookClient', () => ({ readMoonOwnerChunkParts }));

import { clearBookMoonChunks, loadBookMoonChunks } from './bookMoonChunks';

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
  clearBookMoonChunks();
  readMoonOwnerChunkParts.mockReset();
});

describe('loadBookMoonChunks', () => {
  it('reads each book once, through the preferred viewer, and keeps what ESI already reads out', async () => {
    readMoonOwnerChunkParts.mockResolvedValue({
      extractions: [chunk(7001, 30), chunk(7002, 31)],
      feeders: [],
    });
    const out = await loadBookMoonChunks(
      [viewer(1, 20), viewer(2, 20), viewer(3, 40, false)],
      new Set([31]),
      2,
      NOW
    );
    expect(readMoonOwnerChunkParts.mock.calls).toEqual([[2, 20]]);
    expect([...out.keys()]).toEqual([30]);
    expect(out.get(30)).toMatchObject({
      chunks: [{ id: '7001', detail: 'arrival' }],
      needsReauth: false,
    });
  });

  it('leaves out a book that fails or does not exist, while another answers', async () => {
    readMoonOwnerChunkParts.mockImplementation(async (_c: number, corp: number) => {
      if (corp === 20) throw new Error('permission-denied');
      if (corp === 21) return null;
      return { extractions: [chunk(7001, 30)], feeders: [] };
    });
    const out = await loadBookMoonChunks(
      [viewer(1, 20), viewer(2, 21), viewer(3, 22)],
      new Set(),
      undefined,
      NOW
    );
    expect([...out.keys()]).toEqual([30]);
  });

  it('reuses a book read for five minutes, then reads it again; a failed read is never reused', async () => {
    readMoonOwnerChunkParts.mockRejectedValueOnce(new Error('offline'));
    readMoonOwnerChunkParts.mockResolvedValue({ extractions: [chunk(7001, 30)], feeders: [] });
    await loadBookMoonChunks([viewer(1, 20)], new Set(), undefined, NOW);
    await loadBookMoonChunks([viewer(1, 20)], new Set(), undefined, NOW + 1_000);
    await loadBookMoonChunks([viewer(1, 20)], new Set(), undefined, NOW + 2_000);
    expect(readMoonOwnerChunkParts).toHaveBeenCalledTimes(2);
    await loadBookMoonChunks([viewer(1, 20)], new Set(), undefined, NOW + 6 * 60_000);
    expect(readMoonOwnerChunkParts).toHaveBeenCalledTimes(3);
  });
});
